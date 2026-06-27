"""Pipecat voice agent for the Conduence assistant.

Embedded use (single-port server):
    The bot() function is called directly by server.py via /api/offer.
    Voice runs on the same port as the chat UI.

Standalone run (for debugging):
    python voice_agent.py --transport webrtc

Default voice stack:  Deepgram STT → OpenAI LLM → Cartesia TTS
Set VOICE_LLM_PROVIDER=gemini to swap the LLM to Gemini instead.

Each completed voice turn is refined and written to Zep memory so the
knowledge graph stays in sync with voice conversations too.
"""
from __future__ import annotations

import asyncio
import os

from dotenv import load_dotenv
from loguru import logger

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import (
    CancelFrame,
    EndFrame,
    LLMFullResponseEndFrame,
    StartFrame,
    TTSSpeakFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.processors.frame_processor import FrameProcessor
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.workers.runner import WorkerRunner

from instructions import get_system_instructions
import voice_log

load_dotenv(override=True)

# ── Zep client for voice memory sync ──────────────────────────────────────────
_voice_zep      = None
_voice_settings = None
_voice_thread   = None
_DEFAULT_USER   = "shared-user"

try:
    from config import load_settings_status
    from zep_client import build_client, web_thread_id, ensure_thread, get_or_create_user
    _cfg = load_settings_status()
    if _cfg.ready:
        _voice_settings = _cfg.settings
        _voice_zep      = build_client(_cfg.settings)
        get_or_create_user(_voice_zep, _DEFAULT_USER)
        _voice_thread   = web_thread_id(_DEFAULT_USER)
        ensure_thread(_voice_zep, _voice_thread, _DEFAULT_USER)
        logger.info("Voice Zep client initialised — voice turns will update the graph")
except Exception as _e:
    logger.warning(f"Voice Zep client unavailable ({_e}); graph won't update from voice")

VOICE_SYSTEM_INSTRUCTION = f"""\
You are the Conduence voice agent for a trader cognition graph.

Speak naturally and briefly because your replies are read aloud. Avoid markdown,
large lists, emojis, and long paragraphs.

Use the user's market memory, preferences, rules, agents, strategies, and graph
context when available. Ask concise follow-up questions when a memory update or
temporal claim is ambiguous.

When the user asks you to show, fetch, find, list, or pull Polymarket markets:
- Say something brief like "Pulling the live markets for you now — they'll appear as cards below."
- Do NOT attempt to list markets from memory or describe them yourself.
- The system will fetch real-time Polymarket data and display interactive cards in the UI.
- Keep your spoken reply to one sentence; the cards carry the detail.

{get_system_instructions("shared-user")}
"""

VOICE_INTRODUCTION = (
    "Hi, I'm Conduence, your voice agent for your trading cognition graph. "
    "I'm connected and ready when you are."
)

transport_params = {
    "webrtc": lambda: TransportParams(
        audio_in_enabled=True,
        audio_out_enabled=True,
    ),
}


def _voice_language() -> str:
    return os.getenv("VOICE_LANGUAGE", "en-US")


def _build_stt() -> DeepgramSTTService:
    return DeepgramSTTService(
        api_key=os.environ["DEEPGRAM_API_KEY"],
        settings=DeepgramSTTService.Settings(
            model=os.getenv("DEEPGRAM_MODEL", "nova-3-general"),
            language=os.getenv("DEEPGRAM_LANGUAGE", "en"),
            punctuate=True,
            smart_format=True,
            interim_results=True,
        ),
    )


def _build_llm():
    provider = os.getenv("VOICE_LLM_PROVIDER", "openai").lower()

    if provider == "openai":
        return OpenAILLMService(
            api_key=os.getenv("OPENAI_API_KEY") or os.environ["LLM_API_KEY"],
            settings=OpenAILLMService.Settings(
                model=os.getenv("OPENAI_MODEL", "gpt-4o"),
                temperature=float(os.getenv("VOICE_LLM_TEMPERATURE", "0.4")),
                system_instruction=VOICE_SYSTEM_INSTRUCTION,
            ),
        )

    if provider == "gemini":
        from pipecat.services.google.llm import GoogleLLMService

        return GoogleLLMService(
            api_key=(
                os.getenv("GOOGLE_API_KEY")
                or os.getenv("GEMINI_API_KEY")
                or os.environ["LLM_API_KEY"]
            ),
            settings=GoogleLLMService.Settings(
                model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
                temperature=float(os.getenv("VOICE_LLM_TEMPERATURE", "0.4")),
                system_instruction=VOICE_SYSTEM_INSTRUCTION,
            ),
        )

    raise ValueError("VOICE_LLM_PROVIDER must be 'gemini' or 'openai'.")


def _build_tts() -> CartesiaTTSService:
    return CartesiaTTSService(
        api_key=os.environ["CARTESIA_API_KEY"],
        settings=CartesiaTTSService.Settings(
            model=os.getenv("CARTESIA_MODEL", "sonic-3.5"),
            voice=os.environ["CARTESIA_VOICE_ID"],
            language=_voice_language(),
        ),
    )


class ZepContextInjector:
    """Fetches live Zep graph context and injects it into the LLM context per-turn.

    Inserts (or updates) a system-role message at position 0 of the LLMContext
    messages list so the voice LLM always sees up-to-date graph data.
    """

    _CONTEXT_TAG = "<zep_live_context>"

    def __init__(self, context: LLMContext, zep, thread_id: str) -> None:
        self._context = context
        self._zep = zep
        self._thread_id = thread_id

    async def refresh(self) -> None:
        try:
            from chat_agent import get_context_block
            fresh_ctx = await asyncio.to_thread(get_context_block, self._zep, self._thread_id)
            if not fresh_ctx:
                return
            block = f"{self._CONTEXT_TAG}\n{fresh_ctx}\n</{self._CONTEXT_TAG[1:]}"
            msgs = self._context.messages
            for i, msg in enumerate(msgs):
                if (
                    isinstance(msg, dict)
                    and isinstance(msg.get("content"), str)
                    and self._CONTEXT_TAG in msg["content"]
                ):
                    msgs[i] = {"role": "system", "content": block}
                    logger.info("[Voice] Zep context updated (%d chars)", len(fresh_ctx))
                    return
            msgs.insert(0, {"role": "system", "content": block})
            logger.info("[Voice] Zep context injected (%d chars)", len(fresh_ctx))
        except Exception as exc:
            logger.warning("ZepContextInjector.refresh failed: %s", exc)


class ZepMemorySync(FrameProcessor):
    """After each LLM turn, refine the user's voice transcript and push it to Zep.

    Also keeps the LLM system message up-to-date with live Zep graph context via
    ZepContextInjector: once on session start (StartFrame) and once after each
    turn so the next reply always reflects the latest graph state.
    """

    def __init__(self, context: LLMContext, zep, thread_id: str, settings, user_id: str) -> None:
        super().__init__()
        self._context   = context
        self._zep       = zep
        self._thread_id = thread_id
        self._settings  = settings
        self._user_id   = user_id
        self._last_synced: str | None = None
        self._injector  = ZepContextInjector(context, zep, thread_id)

    async def process_frame(self, frame, direction):
        # Only run FrameProcessor lifecycle for control/LLM frames — raw audio
        # reaching this stage must not trigger _check_started before StartFrame.
        if isinstance(frame, (StartFrame, EndFrame, CancelFrame, LLMFullResponseEndFrame)):
            await super().process_frame(frame, direction)
            if isinstance(frame, StartFrame):
                # Eagerly inject current graph context so the very first turn
                # already has access to the user's memory.
                asyncio.create_task(self._injector.refresh())
            if isinstance(frame, LLMFullResponseEndFrame):
                asyncio.create_task(self._sync())
        await self.push_frame(frame, direction)

    async def _sync(self) -> None:
        msgs = self._context.messages
        user_text = None
        assistant_text = None

        # Walk backwards: first assistant turn we hit is the latest reply,
        # first user turn before that is the matching user message.
        for m in reversed(msgs):
            role = m.get("role")
            content = m.get("content", "")

            def _extract(content) -> str | None:  # noqa: ANN001
                if isinstance(content, str):
                    return content.strip() or None
                if isinstance(content, list):
                    parts = [p.get("text", "") for p in content
                             if isinstance(p, dict) and p.get("type") == "text"]
                    return " ".join(parts).strip() or None
                return None

            text = _extract(content)
            if role == "assistant" and assistant_text is None and text:
                assistant_text = text
            elif role == "user" and user_text is None and text:
                user_text = text
                break  # got both; stop scanning

        if not user_text or user_text == self._last_synced:
            return

        # Log this turn to the shared transcript store so the UI can display it.
        voice_log.append_turn("user", user_text)
        if assistant_text:
            voice_log.append_turn("assistant", assistant_text)

        try:
            from chat_agent import persist_voice_turn_to_zep
            from intent import should_skip_zep_ingest

            if should_skip_zep_ingest(user_text):
                # Market lookup — fetch live markets and expose them for the UI card hook.
                logger.info(f"[Voice] market lookup detected, skipping Zep ingest: {user_text[:80]}")
                try:
                    from market_tools import lookup_markets_for_user
                    import app_state
                    lookup = await lookup_markets_for_user(
                        self._zep,
                        self._user_id,
                        user_text,
                        settings=self._settings,
                    )
                    payload = {
                        "action": "market_lookup",
                        "reply": lookup.reply,
                        "markets": lookup.to_market_dicts(),
                        "ingested_to_zep": False,
                    }
                    app_state.last_market_lookup = payload
                    logger.info(
                        f"[Voice→Markets] {len(lookup.markets)} cards stored for UI (status={lookup.status})"
                    )
                except Exception as exc:
                    logger.warning(f"Voice market lookup failed: {exc}")
                self._last_synced = user_text
                return

            memory_text = await asyncio.to_thread(
                persist_voice_turn_to_zep,
                zep=self._zep,
                settings=self._settings,
                thread_id=self._thread_id,
                user_id=self._user_id,
                user_message=user_text,
            )
            if memory_text:
                self._last_synced = user_text
                logger.info(f"[Voice→Zep] {memory_text[:80]}")
        except Exception as exc:
            logger.warning(f"ZepMemorySync failed: {exc}")

        # Refresh context for the next turn regardless of whether we wrote to Zep.
        asyncio.create_task(self._injector.refresh())


async def run_bot(transport: BaseTransport, runner_args: RunnerArguments) -> None:
    logger.info("Starting Conduence voice agent")

    stt = _build_stt()
    llm = _build_llm()
    tts = _build_tts()

    context = LLMContext()
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()),
    )

    zep_sync = (
        ZepMemorySync(context, _voice_zep, _voice_thread, _voice_settings, _DEFAULT_USER)
        if _voice_zep and _voice_thread and _voice_settings
        else None
    )
    pipeline_stages = [
        transport.input(),
        stt,
        user_aggregator,
        llm,
    ]
    if zep_sync:
        pipeline_stages.append(zep_sync)
    pipeline_stages.extend([
        tts,
        transport.output(),
        assistant_aggregator,
    ])

    pipeline = Pipeline(pipeline_stages)
    logger.info("Voice pipeline: ZepMemorySync placed after LLM (before TTS)")

    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
        idle_timeout_secs=runner_args.pipeline_idle_timeout_secs,
    )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):  # noqa: ANN001
        logger.info("Voice client connected")
        await worker.queue_frames([
            TTSSpeakFrame(VOICE_INTRODUCTION, append_to_context=True),
        ])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):  # noqa: ANN001
        logger.info("Voice client disconnected")
        await worker.cancel()

    runner = WorkerRunner(handle_sigint=runner_args.handle_sigint)
    await runner.add_workers(worker)
    await runner.run()


async def bot(runner_args: RunnerArguments) -> None:
    """Main bot entrypoint compatible with Pipecat runner / Pipecat Cloud."""
    transport = await create_transport(runner_args, transport_params)
    await run_bot(transport, runner_args)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
