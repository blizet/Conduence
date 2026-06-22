"""
Flask web server for the trading assistant chat UI.

Usage:
    python server.py

Then open http://localhost:5000 in a browser.

For now this is a single SHARED chat: everyone who opens the page talks
to the same Zep user (DEFAULT_USER_ID below) and the same underlying
graph, on one running thread for the life of the server process. That
matches the "one client/localhost, shared graph" setup -- per-person
login can be layered on top later without touching the graph/ontology
code at all.
"""
from __future__ import annotations

from flask import Flask, Response, jsonify, render_template, request
from werkzeug.exceptions import HTTPException

from chat_agent import run_turn
from config import load_settings_status
from graph_snapshot import fetch_user_graph_with_retry
from zep_client import (
    build_client,
    ensure_thread,
    get_or_create_user,
    web_thread_id,
)
from zep_cloud.client import Zep
from zep_cloud.core.api_error import ApiError

import re

DEFAULT_USER_ID = "shared-user"
DEFAULT_THREAD_ID = web_thread_id(DEFAULT_USER_ID)


# ── name / email extraction ───────────────────────────────────────────────────
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}", re.IGNORECASE)
_NAME_RE  = re.compile(
    r"""(?:i\s+am|i'm|my\s+name\s+is|name\s+is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)""",
    re.IGNORECASE,
)


def _try_update_user_profile(zep_client: Zep, user_id: str, message: str) -> None:
    """If the message contains a name/email, push them to the Zep user record."""
    updates: dict = {}

    email_match = _EMAIL_RE.search(message)
    if email_match:
        updates["email"] = email_match.group(0)

    name_match = _NAME_RE.search(message)
    if name_match:
        parts = name_match.group(1).strip().split()
        updates["first_name"] = parts[0]
        if len(parts) > 1:
            updates["last_name"] = " ".join(parts[1:])

    if updates:
        try:
            zep_client.user.update(user_id=user_id, **updates)
        except Exception:  # noqa: BLE001 — non-critical
            pass

app = Flask(__name__)
# Turn off debug propagation so our @errorhandler always fires (not Flask's HTML debugger).
app.config["PROPAGATE_EXCEPTIONS"] = False


@app.errorhandler(Exception)
def _json_error(exc: Exception):
    """Catch-all so unhandled exceptions always return JSON, never Flask HTML debugger pages."""
    if isinstance(exc, HTTPException):
        return jsonify({"error": exc.description}), exc.code

    from flask import jsonify as _jsonify
    import traceback
    traceback.print_exc()          # still prints to server terminal for debugging
    return _jsonify({"error": str(exc)}), 500


@app.get("/favicon.ico")
def favicon() -> Response:
    """Browsers request this automatically; return no content if the app has no icon."""
    return Response(status=204)

config_status = load_settings_status()
settings = config_status.settings
zep: Zep | None = None
thread_id: str | None = None

if config_status.ready:
    zep = build_client(settings)
    get_or_create_user(zep, DEFAULT_USER_ID)
    thread_id = DEFAULT_THREAD_ID
    ensure_thread(zep, thread_id, DEFAULT_USER_ID)

    from instructions import push_to_zep as _push_instructions
    _push_instructions(zep, user_id=DEFAULT_USER_ID)

# In-memory conversation history for this single shared session. Lost on
# server restart, but the Zep graph itself is not -- that's persisted
# remotely regardless of this process's lifetime.
conversation_history: list[dict[str, str]] = []


def _ensure_chat_thread() -> str:
    global thread_id
    if zep is None:
        raise RuntimeError("Zep client is not configured.")
    thread_id = DEFAULT_THREAD_ID
    ensure_thread(zep, thread_id, DEFAULT_USER_ID)
    return thread_id


@app.get("/")
def index():
    return render_template(
        "index.html",
        provider=settings.llm_provider,
        model=settings.model,
        config_ready=config_status.ready,
        missing_keys=list(config_status.missing_keys),
    )


@app.get("/api/config")
def config():
    return jsonify(
        {
            "ready": config_status.ready,
            "missing_keys": list(config_status.missing_keys),
            "provider": settings.llm_provider,
            "model": settings.model,
        }
    )


@app.get("/api/graph")
def graph():
    if not config_status.ready or zep is None:
        return jsonify(
            {
                "has_graph": False,
                "node_count": 0,
                "edge_count": 0,
                "nodes": [],
                "edges": [],
                "error": "API keys are not configured.",
            }
        )

    try:
        payload = fetch_user_graph_with_retry(zep, DEFAULT_USER_ID)
        return jsonify(payload)
    except Exception as exc:  # noqa: BLE001 — surface Zep errors without breaking polling
        return jsonify(
            {
                "has_graph": False,
                "node_count": 0,
                "edge_count": 0,
                "nodes": [],
                "edges": [],
                "error": str(exc),
            }
        )


@app.get("/api/user")
def user_info():
    if not config_status.ready or zep is None:
        return jsonify({"error": "not configured"}), 503
    try:
        u = zep.user.get(user_id=DEFAULT_USER_ID)
        node_resp = zep.user.get_node(user_id=DEFAULT_USER_ID)
        summary = (node_resp.node.summary if node_resp and node_resp.node else None)
        return jsonify({
            "user_id":    u.user_id,
            "first_name": u.first_name,
            "last_name":  u.last_name,
            "email":      u.email,
            "summary":    summary,
        })
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)}), 502


@app.get("/api/history")
def history():
    return jsonify({"messages": conversation_history})


def _run_chat_turn(user_message: str, active_thread: str):
    return run_turn(
        zep=zep,
        settings=settings,
        thread_id=active_thread,
        user_id=DEFAULT_USER_ID,
        user_message=user_message,
        conversation_history=conversation_history,
    )


@app.post("/api/chat")
def chat():
    if not config_status.ready or zep is None or thread_id is None:
        return jsonify(
            {
                "error": (
                    "API keys are not configured. Set "
                    + ", ".join(config_status.missing_keys)
                    + " in .env and restart the server."
                )
            }
        ), 503

    payload = request.get_json(silent=True) or {}
    user_message = (payload.get("message") or "").strip()

    if not user_message:
        return jsonify({"error": "message is required"}), 400

    try:
        active_thread = _ensure_chat_thread()
        try:
            result = _run_chat_turn(user_message, active_thread)
        except ApiError as exc:
            if exc.status_code != 404:
                raise
            active_thread = _ensure_chat_thread()
            result = _run_chat_turn(user_message, active_thread)
    except ApiError as exc:
        return jsonify({"error": str(exc)}), 502
    except Exception as exc:  # noqa: BLE001 — always return JSON, never Flask HTML errors
        return jsonify({"error": str(exc)}), 500

    conversation_history.append({"role": "user", "content": user_message})
    conversation_history.append({"role": "assistant", "content": result.reply})

    # Best-effort: detect and persist user name/email from the message
    _try_update_user_profile(zep, DEFAULT_USER_ID, user_message)

    return jsonify({"reply": result.reply})


if __name__ == "__main__":
    print(f"Using LLM provider: {settings.llm_provider} ({settings.model})")
    if config_status.ready:
        print(f"Shared user: {DEFAULT_USER_ID}  |  thread: {thread_id}")
    else:
        print(
            "WARNING: missing API keys — "
            + ", ".join(config_status.missing_keys)
            + ". Copy .env.example to .env and restart."
        )
    print("Open http://localhost:5000 in your browser.")
    # debug=False so Flask doesn't bypass @app.errorhandler with its HTML debugger.
    app.run(host="0.0.0.0", port=5000, debug=False)
