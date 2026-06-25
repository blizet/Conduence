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
    LLMRunFrame,
    StartFrame,
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

load_dotenv(override=True)

_DEBUG_LOG = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "debug-ad0552.log"))


def _agent_dbg(hypothesis_id: str, location: str, message: str, data: dict | None = None) -> None:
    # region agent log
    import json
    import time

    try:
        with open(_DEBUG_LOG, "a", encoding="utf-8") as f:
            f.write(
                json.dumps(
                    {
                        "sessionId": "ad0552",
                        "hypothesisId": hypothesis_id,
                        "location": location,
                        "message": message,
                        "data": data or {},
                        "timestamp": int(time.time() * 1000),
                        "runId": "pre-fix",
                    }
                )
                + "\n"
            )
    except Exception:
        pass
    # endregion

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
    _agent_dbg(
        "H1",
        "voice_agent.py:module_init",
        "Voice Zep client init",
        {"ready": bool(_voice_zep), "thread_id": _voice_thread},
    )
except Exception as _e:
    logger.warning(f"Voice Zep client unavailable ({_e}); graph won't update from voice")
    _agent_dbg(
        "H1",
        "voice_agent.py:module_init",
        "Voice Zep client init failed",
        {"error": str(_e)},
    )

VOICE_SYSTEM_INSTRUCTION = f"""\
You are the Conduence voice agent for a trader cognition graph.

Speak naturally and briefly because your replies are read aloud. Avoid markdown,
large lists, emojis, and long paragraphs.

Use the user's market memory, preferences, rules, agents, strategies, and graph
context when available. Ask concise follow-up questions when a memory update or
temporal claim is ambiguous.

{get_system_instructions("shared-user")}
"""

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


class ZepMemorySync(FrameProcessor):
    """After each LLM turn, refine the user's voice transcript and push it to Zep."""

    def __init__(self, context: LLMContext, zep, thread_id: str, settings, user_id: str) -> None:
        super().__init__()
        self._context   = context
        self._zep       = zep
        self._thread_id = thread_id
        self._settings  = settings
        self._user_id   = user_id
        self._last_synced: str | None = None

    async def process_frame(self, frame, direction):
        # Only run FrameProcessor lifecycle for control/LLM frames — raw audio
        # reaching this stage must not trigger _check_started before StartFrame.
        if isinstance(frame, (StartFrame, EndFrame, CancelFrame, LLMFullResponseEndFrame)):
            await super().process_frame(frame, direction)
            if isinstance(frame, LLMFullResponseEndFrame):
                # region agent log
                _agent_dbg("H2", "voice_agent.py:process_frame", "LLMFullResponseEndFrame received", {})
                # endregion
                asyncio.create_task(self._sync())
        await self.push_frame(frame, direction)

    async def _sync(self) -> None:
        msgs = self._context.messages
        user_text = None
        for m in reversed(msgs):
            if m.get("role") == "user":
                content = m.get("content", "")
                if isinstance(content, str) and content.strip():
                    user_text = content.strip()
                    break
                if isinstance(content, list):
                    parts = [p.get("text", "") for p in content
                             if isinstance(p, dict) and p.get("type") == "text"]
                    user_text = " ".join(parts).strip() or None
                    if user_text:
                        break

        # region agent log
        _agent_dbg(
            "H3",
            "voice_agent.py:_sync",
            "Extracted user text for Zep",
            {
                "has_user_text": bool(user_text),
                "user_text_len": len(user_text or ""),
                "skipped_dedup": user_text == self._last_synced if user_text else False,
                "recent_roles": [m.get("role") for m in msgs[-8:]],
            },
        )
        # endregion

        if not user_text or user_text == self._last_synced:
            return

        try:
            from chat_agent import persist_voice_turn_to_zep

            memory_text = await asyncio.to_thread(
                persist_voice_turn_to_zep,
                zep=self._zep,
                settings=self._settings,
                thread_id=self._thread_id,
                user_id=self._user_id,
                user_message=user_text,
            )
            # region agent log
            _agent_dbg(
                "H5",
                "voice_agent.py:_sync",
                "persist_voice_turn_to_zep finished",
                {"saved": bool(memory_text), "memory_text_len": len(memory_text or "")},
            )
            # endregion
            if memory_text:
                self._last_synced = user_text
                logger.info(f"[Voice→Zep] {memory_text[:80]}")
        except Exception as exc:
            # region agent log
            _agent_dbg("H5", "voice_agent.py:_sync", "ZepMemorySync exception", {"error": str(exc)})
            # endregion
            logger.warning(f"ZepMemorySync failed: {exc}")


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
    # region agent log
    _agent_dbg(
        "H1",
        "voice_agent.py:run_bot",
        "Pipeline ZepMemorySync attached",
        {"zep_sync": zep_sync is not None, "position": "after_llm"},
    )
    # endregion

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
    # region agent log
    _agent_dbg(
        "H2",
        "voice_agent.py:run_bot",
        "Pipeline built",
        {"stages": [type(s).__name__ for s in pipeline_stages]},
    )
    # endregion

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
        context.add_message(
            {
                "role": "developer",
                "content": "Introduce yourself as the Conduence voice agent in one short sentence.",
            }
        )
        await worker.queue_frames([LLMRunFrame()])

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
