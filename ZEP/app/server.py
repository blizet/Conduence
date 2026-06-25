"""
FastAPI web server for the Conduence trading assistant.

Single-port server combining:
  - Pipecat prebuilt WebRTC voice client (/client, embedded on /)
  - Text chat with Zep memory and graph updates (/api/chat)
  - Knowledge-graph viewer (/graph, /embed/graph)

Run:
    python server.py
    uvicorn server:app --host 0.0.0.0 --port 5000 --reload

Open http://localhost:5000
"""
from __future__ import annotations

import json
import os
import re
import uuid
from contextlib import asynccontextmanager
from datetime import date
from typing import Any

from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from chat_agent import prepare_memory_review, run_turn
from config import load_settings_status
from graph_snapshot import fetch_user_graph_with_retry
from llm import generate_reply
from zep_client import (
    build_client,
    ensure_thread,
    get_or_create_user,
    web_thread_id,
)
from zep_cloud.client import Zep
from zep_cloud.core.api_error import ApiError


DEFAULT_USER_ID = "shared-user"
DEFAULT_THREAD_ID = web_thread_id(DEFAULT_USER_ID)

_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}", re.IGNORECASE)
_NAME_RE  = re.compile(
    r"""(?:i\s+am|i'm|my\s+name\s+is|name\s+is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)""",
    re.IGNORECASE,
)

config_status = load_settings_status()
settings = config_status.settings
zep: Zep | None = None
thread_id: str | None = None
conversation_history: list[dict[str, str]] = []
pending_memory: dict[str, Any] | None = None

# Active WebRTC sessions: session_id → request body data
_active_sessions: dict[str, dict[str, Any]] = {}

MEMORY_DECISIONS = {
    "update": "Update existing memory",
    "keep_both": "Keep both memories",
    "ignore": "Ignore the new memory",
}

_MEMORY_DECISION_PROMPT = """\
Classify the user's reply to a pending memory confirmation.

The assistant asked whether to:
- update the existing memory
- keep both memories
- ignore the new memory

Return ONLY valid JSON:
{"decision": "update" | "keep_both" | "ignore" | "unclear", "reason": "short reason"}

Use semantic intent, not exact wording. If the user affirms updating,
correcting, replacing, merging, or accepting the proposed correction, choose
"update". If they want both versions preserved, choose "keep_both". If they
reject, cancel, or do not want to save the new memory, choose "ignore". If the
reply does not resolve the pending memory, choose "unclear".
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    global zep, thread_id
    if config_status.ready:
        zep = build_client(settings)
        get_or_create_user(zep, DEFAULT_USER_ID)
        thread_id = DEFAULT_THREAD_ID
        ensure_thread(zep, thread_id, DEFAULT_USER_ID)
        try:
            from instructions import push_to_zep as _push_instructions
            _push_instructions(zep, user_id=DEFAULT_USER_ID)
        except Exception:
            pass
    yield
    # Clean up SmallWebRTC handler on shutdown
    try:
        await _small_webrtc_handler.close()
    except Exception:
        pass


# ── SmallWebRTC handler (initialised once, shared across requests) ─────────────
from pipecat.transports.smallwebrtc.request_handler import (
    IceCandidate,
    SmallWebRTCPatchRequest,
    SmallWebRTCRequest,
    SmallWebRTCRequestHandler,
)

_small_webrtc_handler = SmallWebRTCRequestHandler(esp32_mode=False, host="localhost")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

try:
    from pipecat_ai_prebuilt.frontend import PipecatPrebuiltUI

    app.mount("/client", PipecatPrebuiltUI, name="pipecat-client")
except ImportError:
    PipecatPrebuiltUI = None  # type: ignore[misc, assignment]


# ── helpers ───────────────────────────────────────────────────────────────────

def _try_update_user_profile(zep_client: Zep, user_id: str, message: str) -> None:
    updates: dict = {}
    if m := _EMAIL_RE.search(message):
        updates["email"] = m.group(0)
    if m := _NAME_RE.search(message):
        parts = m.group(1).strip().split()
        updates["first_name"] = parts[0]
        if len(parts) > 1:
            updates["last_name"] = " ".join(parts[1:])
    if updates:
        try:
            zep_client.user.update(user_id=user_id, **updates)
        except Exception:
            pass


def _ensure_chat_thread() -> str:
    global thread_id
    if zep is None:
        raise RuntimeError("Zep client is not configured.")
    thread_id = DEFAULT_THREAD_ID
    ensure_thread(zep, thread_id, DEFAULT_USER_ID)
    return thread_id


def _build_memory_confirmation_reply(review: dict[str, Any]) -> str:
    status = review.get("status") or "similar"
    memory_text = review.get("memory_text") or ""
    matches = review.get("matches") or []
    reason = review.get("reason") or "This looks related to something already in memory."
    lines = [
        f"I found a possible {status} before saving this to memory.",
        "",
        "New memory candidate:",
        memory_text,
        "",
        f"Why I paused: {reason}",
    ]
    if matches:
        lines.extend(["", "Existing memory I matched:"])
        lines.extend(f"- {m}" for m in matches[:3])
    lines.extend(["", "Should I update the existing memory, keep both, or ignore this new memory?"])
    return "\n".join(lines)


def _pending_memory_payload(review: dict[str, Any]) -> dict[str, Any]:
    return {
        "memory_text": review.get("memory_text"),
        "status": review.get("status"),
        "reason": review.get("reason"),
        "matches": review.get("matches") or [],
        "choices": [{"id": d, "label": l} for d, l in MEMORY_DECISIONS.items()],
    }


def _parse_json_object(text: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not m:
        return None
    try:
        parsed = json.loads(m.group(0))
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def _parse_memory_decision(value: str, review: dict[str, Any]) -> str | None:
    explicit_action = value.strip()
    if explicit_action in MEMORY_DECISIONS:
        return explicit_action
    payload = {
        "user_reply": value,
        "pending_memory": {
            "memory_text": review.get("memory_text"),
            "status":      review.get("status"),
            "reason":      review.get("reason"),
            "matches":     review.get("matches") or [],
        },
    }
    response = generate_reply(
        settings,
        system_prompt=_MEMORY_DECISION_PROMPT,
        messages=[{"role": "user", "content": json.dumps(payload, indent=2)}],
    )
    parsed = _parse_json_object(response) or {}
    decision = str(parsed.get("decision") or "unclear")
    return decision if decision in MEMORY_DECISIONS else None


def _memory_text_for_decision(decision: str, memory_text: str) -> str | None:
    if decision == "ignore":
        return None
    today = date.today().isoformat()
    if decision == "update":
        return (
            f"Update existing memory as of {today}. "
            "This supersedes older matching memory rather than creating a duplicate.\n"
            f"{memory_text}"
        )
    if decision == "keep_both":
        return (
            f"Additional distinct memory as of {today}. "
            "Keep this alongside similar existing memory.\n"
            f"{memory_text}"
        )
    return memory_text


# ── routes ────────────────────────────────────────────────────────────────────

@app.get("/favicon.ico")
async def favicon() -> Response:
    return Response(status_code=204)


@app.get("/")
def index(request: Request):
    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "provider":     settings.llm_provider,
            "model":        settings.model,
            "config_ready": config_status.ready,
            "missing_keys": list(config_status.missing_keys),
        },
    )


@app.get("/graph")
def graph_page(request: Request):
    return templates.TemplateResponse(
        request,
        "graph.html",
        {"config_ready": config_status.ready},
    )


@app.get("/embed/graph")
def graph_embed_page(request: Request):
    """Minimal graph canvas for iframe embedding on the home split view."""
    return templates.TemplateResponse(
        request,
        "graph_embed.html",
        {"config_ready": config_status.ready},
    )


@app.get("/client-redirect", include_in_schema=False)
async def client_redirect():
    """Open the prebuilt Pipecat client (standalone)."""
    return RedirectResponse(url="/client/")


@app.get("/api/config")
def config_endpoint():
    return JSONResponse({
        "ready":        config_status.ready,
        "missing_keys": list(config_status.missing_keys),
        "provider":     settings.llm_provider,
        "model":        settings.model,
    })


@app.get("/api/voice/config")
def voice_config():
    return JSONResponse({
        "enabled":   True,
        "transport": "small-webrtc",
        "stt":       "deepgram",
        "llm":       os.environ.get("VOICE_LLM_PROVIDER", "openai").strip() or "openai",
        "tts":       "cartesia",
    })


@app.get("/api/graph")
def graph():
    if not config_status.ready or zep is None:
        return JSONResponse({
            "has_graph": False, "node_count": 0, "edge_count": 0,
            "nodes": [], "edges": [], "error": "API keys are not configured.",
        })
    try:
        return JSONResponse(fetch_user_graph_with_retry(zep, DEFAULT_USER_ID))
    except Exception as exc:
        return JSONResponse({
            "has_graph": False, "node_count": 0, "edge_count": 0,
            "nodes": [], "edges": [], "error": str(exc),
        })


@app.get("/api/memories")
def memories():
    """Graph node summaries for the CONTEXT memories panel."""
    if not config_status.ready or zep is None:
        return JSONResponse({"memories": [], "error": "API keys are not configured."})
    try:
        graph = fetch_user_graph_with_retry(zep, DEFAULT_USER_ID)
        items = []
        for node in graph.get("nodes", []):
            summary = (node.get("summary") or node.get("name") or "").strip()
            if not summary:
                continue
            items.append({
                "id": node.get("id"),
                "summary": summary,
                "label": node.get("label") or "Entity",
                "name": node.get("name") or "",
            })
        return JSONResponse({"memories": items[:30]})
    except Exception as exc:
        return JSONResponse({"memories": [], "error": str(exc)})


@app.get("/api/user")
def user_info():
    if not config_status.ready or zep is None:
        return JSONResponse({"error": "not configured"}, status_code=503)
    try:
        u = zep.user.get(user_id=DEFAULT_USER_ID)
        node_resp = zep.user.get_node(user_id=DEFAULT_USER_ID)
        summary = node_resp.node.summary if node_resp and node_resp.node else None
        return JSONResponse({
            "user_id":    u.user_id,
            "first_name": u.first_name,
            "last_name":  u.last_name,
            "email":      u.email,
            "summary":    summary,
        })
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=502)


@app.get("/api/history")
def history():
    return JSONResponse({"messages": conversation_history})


def _run_chat_turn(user_message, active_thread, *, memory_text=None, ingest_memory=True):
    return run_turn(
        zep=zep,
        settings=settings,
        thread_id=active_thread,
        user_id=DEFAULT_USER_ID,
        user_message=user_message,
        conversation_history=conversation_history,
        memory_text=memory_text,
        ingest_memory=ingest_memory,
    )


@app.post("/api/chat")
async def chat(request: Request):
    global pending_memory

    if not config_status.ready or zep is None or thread_id is None:
        return JSONResponse(
            {"error": "API keys not configured. Set "
             + ", ".join(config_status.missing_keys) + " in .env and restart."},
            status_code=503,
        )

    body = await request.json()
    user_message   = (body.get("message") or "").strip()
    memory_decision = (body.get("memory_decision") or "").strip()

    if not user_message and not memory_decision:
        return JSONResponse({"error": "message is required"}, status_code=400)

    try:
        active_thread = _ensure_chat_thread()

        if pending_memory is not None:
            decision = _parse_memory_decision(
                memory_decision or user_message, pending_memory["review"]
            )
            if decision is None:
                return JSONResponse({
                    "reply": (
                        "Please choose how to handle the pending memory first: "
                        "update existing memory, keep both memories, or ignore the new memory."
                    ),
                    "pending_memory": _pending_memory_payload(pending_memory["review"]),
                })

            original_message      = pending_memory["original_message"]
            candidate_text        = pending_memory["review"]["memory_text"]
            confirmed_memory_text = _memory_text_for_decision(decision, candidate_text)
            pending_memory        = None

            try:
                result = _run_chat_turn(original_message, active_thread,
                    memory_text=confirmed_memory_text,
                    ingest_memory=confirmed_memory_text is not None)
            except ApiError as exc:
                if exc.status_code != 404:
                    raise
                result = _run_chat_turn(original_message, _ensure_chat_thread(),
                    memory_text=confirmed_memory_text,
                    ingest_memory=confirmed_memory_text is not None)

            reply = f"{MEMORY_DECISIONS.get(decision, 'Resolved')}. {result.reply}"
            conversation_history.append({"role": "assistant", "content": reply})
            _try_update_user_profile(zep, DEFAULT_USER_ID, original_message)
            return JSONResponse({"reply": reply})

        review = prepare_memory_review(
            zep=zep, settings=settings,
            user_id=DEFAULT_USER_ID, user_message=user_message,
        )
        if review.needs_confirmation:
            review_payload = review.to_dict()
            pending_memory = {"original_message": user_message, "review": review_payload}
            reply = _build_memory_confirmation_reply(review_payload)
            conversation_history.append({"role": "user",      "content": user_message})
            conversation_history.append({"role": "assistant", "content": reply})
            return JSONResponse({
                "reply": reply,
                "pending_memory": _pending_memory_payload(review_payload),
            })

        try:
            result = _run_chat_turn(user_message, active_thread,
                memory_text=review.memory_text,
                ingest_memory=review.memory_text is not None)
        except ApiError as exc:
            if exc.status_code != 404:
                raise
            result = _run_chat_turn(user_message, _ensure_chat_thread(),
                memory_text=review.memory_text,
                ingest_memory=review.memory_text is not None)

    except ApiError as exc:
        return JSONResponse({"error": str(exc)}, status_code=502)
    except Exception as exc:
        import traceback; traceback.print_exc()
        return JSONResponse({"error": str(exc)}, status_code=500)

    conversation_history.append({"role": "user",      "content": user_message})
    conversation_history.append({"role": "assistant", "content": result.reply})
    _try_update_user_profile(zep, DEFAULT_USER_ID, user_message)
    return JSONResponse({"reply": result.reply})


# ── WebRTC voice (Pipecat SmallWebRTC, same port) ────────────────────────────

@app.post("/start")
async def start_agent(request: Request):
    """Called by the Pipecat prebuilt UI to initialise a session.

    Returns a sessionId that the client then uses with
    POST /sessions/{sessionId}/api/offer for the WebRTC handshake.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    session_id = str(uuid.uuid4())
    _active_sessions[session_id] = body.get("body", {})
    return {"sessionId": session_id}


async def _run_voice_bot(
    request: SmallWebRTCRequest,
    background_tasks: BackgroundTasks,
    session_id: str,
):
    """Shared helper: connect the SmallWebRTC handler and launch the bot."""
    from voice_agent import bot as voice_bot

    async def _connection_callback(connection):
        runner_args_type = None
        try:
            from pipecat.runner.types import SmallWebRTCRunnerArguments
            runner_args_type = SmallWebRTCRunnerArguments
        except ImportError:
            pass

        if runner_args_type:
            runner_args = runner_args_type(
                webrtc_connection=connection,
                body=_active_sessions.get(session_id, {}),
                session_id=session_id,
            )
        else:
            from pipecat.runner.types import RunnerArguments
            runner_args = RunnerArguments(
                body=_active_sessions.get(session_id, {}),
                session_id=session_id,
            )
        background_tasks.add_task(voice_bot, runner_args)

    return await _small_webrtc_handler.handle_web_request(
        request=request,
        webrtc_connection_callback=_connection_callback,
    )


@app.post("/api/offer")
async def webrtc_offer(request: SmallWebRTCRequest, background_tasks: BackgroundTasks):
    """Direct WebRTC offer endpoint (used by custom clients)."""
    return await _run_voice_bot(request, background_tasks, session_id=str(uuid.uuid4()))


@app.patch("/api/offer")
async def webrtc_ice(request: SmallWebRTCPatchRequest):
    """ICE candidate trickle for the direct /api/offer flow."""
    await _small_webrtc_handler.handle_patch_request(request)
    return {"status": "success"}


@app.api_route(
    "/sessions/{session_id}/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
)
async def sessions_proxy(
    session_id: str,
    path: str,
    request: Request,
    background_tasks: BackgroundTasks,
):
    """Proxy used by the Pipecat prebuilt UI for session-scoped requests."""
    if session_id not in _active_sessions:
        return Response(content="Invalid or expired session_id", status_code=404)

    if path.endswith("api/offer"):
        try:
            body = await request.json()
        except Exception:
            return Response(content="Invalid JSON", status_code=400)

        if request.method == "POST":
            webrtc_req = SmallWebRTCRequest(
                sdp=body["sdp"],
                type=body["type"],
                pc_id=body.get("pc_id"),
                restart_pc=body.get("restart_pc"),
                request_data=body.get("request_data")
                    or body.get("requestData")
                    or _active_sessions.get(session_id, {}),
            )
            return await _run_voice_bot(webrtc_req, background_tasks, session_id)

        if request.method == "PATCH":
            patch_req = SmallWebRTCPatchRequest(
                pc_id=body["pc_id"],
                candidates=[IceCandidate(**c) for c in body.get("candidates", [])],
            )
            await _small_webrtc_handler.handle_patch_request(patch_req)
            return {"status": "success"}

    return Response(status_code=200)


# ── entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    print(f"Using LLM provider: {settings.llm_provider} ({settings.model})")
    if not config_status.ready:
        print("WARNING: missing API keys — " + ", ".join(config_status.missing_keys))
    print("Open http://localhost:5000")
    uvicorn.run(app, host="0.0.0.0", port=5000, log_level="info")
