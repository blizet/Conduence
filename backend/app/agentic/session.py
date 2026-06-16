"""In-memory agentic graph chat sessions."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

from app.agentic.config import LlmConfig
from app.agentic.graph import (
    apply_llm_delta,
    apply_weights_from_quoted_context,
    apply_weights_from_recent_assistant_messages,
    create_empty_graph,
    graph_is_complete,
    graph_summary,
    pending_weight_questions,
    sanitize_graph,
    supplement_graph_from_prose,
    supplement_graph_from_text,
)
from app.agentic.llm_graph import call_graph_llm
from app.agentic.memory import fetch_supermemory_context, persist_to_supermemory
from app.agentic.shared_graph import agentic_chat_mutations_enabled, load_shared_agentic_graph
from app.agentic.pricing import estimate_cost_usd
from app.agentic.tokens import add_turn_usage, empty_conversation_usage, with_cost_usd
from app.agentic.weight import clamp_weight, parse_batch_weight_answers

MAX_HISTORY_MESSAGES = 80


@dataclass
class Session:
    id: str
    messages: list[dict[str, str]] = field(default_factory=list)
    graph: dict = field(default_factory=create_empty_graph)
    token_usage: dict = field(default_factory=empty_conversation_usage)
    supermemory_loaded: bool = False


_sessions: dict[str, Session] = {}


def get_session(session_id: str) -> Session | None:
    return _sessions.get(session_id)


def _welcome_message(
    *,
    node_count: int,
    edge_count: int,
    supermemory_loaded: bool,
    fresh_chat: bool,
) -> str:
    graph_line = (
        f"The shared macro correlation graph is loaded ({node_count} nodes, {edge_count} edges). "
        if node_count
        else "No shared graph is loaded yet — run seed_agentic_graph_supermemory.py after setting SUPERMEMORY_API_KEY. "
    )
    sm = "Restored from Supermemory. " if supermemory_loaded else ""
    chat_hint = (
        "Ask questions about relationships, sectors, or impacts — chat won't reshape this curated graph. "
        if not agentic_chat_mutations_enabled()
        else "Describe refinements in chat or click edges to set weights (−1 to 1) in the sidebar. "
    )
    fresh = "New chat session. " if fresh_chat else ""
    return f"{fresh}{sm}{graph_line}{chat_hint}Click any edge to inspect or adjust its weight."


async def create_session(container_tag: str, fresh: bool = False) -> Session:
    graph, supermemory_loaded = await load_shared_agentic_graph(container_tag)

    session = Session(
        id=str(uuid.uuid4()),
        messages=[
            {
                "role": "assistant",
                "content": _welcome_message(
                    node_count=len(graph["nodes"]),
                    edge_count=len(graph["edges"]),
                    supermemory_loaded=supermemory_loaded,
                    fresh_chat=fresh,
                ),
            }
        ],
        graph=graph,
        supermemory_loaded=supermemory_loaded,
    )
    _sessions[session.id] = session
    return session


def _trim_history(messages: list[dict[str, str]]) -> list[dict[str, str]]:
    if len(messages) <= MAX_HISTORY_MESSAGES:
        return messages
    return messages[-MAX_HISTORY_MESSAGES:]


def _build_context_block(session: Session, memory_context: str | None) -> str:
    pending = pending_weight_questions(session.graph)
    pending_lines = (
        "\n".join(
            f"- {q['sourceLabel']} → {q['targetLabel']} "
            f"({'direct' if q['expectedSign'] == 1 else 'inverse'}, weight not set)"
            for q in pending
        )
        if pending
        else "none"
    )
    parts = [
        f"Supermemory context:\n{memory_context}" if memory_context else None,
        f"Current graph:\n{graph_summary(session.graph)}",
        f"Edges still needing a weight:\n{pending_lines}",
        "Graph UI: the user can click any edge on the live graph to open a weight slider "
        "in the sidebar and apply a value in [-1, 1] without typing in chat.",
    ]
    return "\n\n".join(p for p in parts if p)


def _apply_local_batch_weight_fallback(session: Session, user_message: str) -> None:
    pending = pending_weight_questions(session.graph)
    if not pending:
        return
    updates = parse_batch_weight_answers(user_message, pending)
    if not updates:
        return
    session.graph = apply_llm_delta(session.graph, {"assistant_message": "", "weight_updates": updates})


async def handle_chat(
    session_id: str | None,
    user_message: str,
    llm_config: LlmConfig,
    container_tag: str,
) -> dict[str, Any]:
    active = get_session(session_id) if session_id else None
    if not active:
        active = await create_session(container_tag)

    active.messages.append({"role": "user", "content": user_message})

    if agentic_chat_mutations_enabled():
        active.graph = supplement_graph_from_prose(active.graph, user_message)
        active.graph = supplement_graph_from_text(active.graph, user_message)
        active.graph = apply_weights_from_recent_assistant_messages(active.graph, active.messages, user_message)
        _apply_local_batch_weight_fallback(active, user_message)
        active.graph = sanitize_graph(active.graph)

    memory_context, _ = await fetch_supermemory_context(container_tag, user_message)
    llm_result, turn_usage = await call_graph_llm(
        llm_config,
        _build_context_block(active, memory_context),
        _trim_history(active.messages),
    )

    if turn_usage:
        cost_usd = estimate_cost_usd(llm_config["provider"], llm_config["model"], turn_usage)
        active.token_usage = add_turn_usage(
            active.token_usage,
            with_cost_usd(turn_usage, cost_usd),
        )

    if llm_result and agentic_chat_mutations_enabled():
        active.graph = apply_llm_delta(active.graph, llm_result)
        active.graph = supplement_graph_from_prose(active.graph, user_message)
        active.graph = supplement_graph_from_text(active.graph, user_message)
        active.graph = apply_weights_from_quoted_context(
            active.graph,
            llm_result.get("assistant_message", ""),
            user_message,
        )
        _apply_local_batch_weight_fallback(active, user_message)

    if agentic_chat_mutations_enabled():
        active.graph = sanitize_graph(active.graph)
    pending = pending_weight_questions(active.graph)
    reply = (llm_result or {}).get("assistant_message", "").strip() or (
        "LLM unavailable — check provider/key in settings."
    )

    active.messages.append({"role": "assistant", "content": reply})
    await persist_to_supermemory(
        container_tag,
        user_message,
        reply,
        active.graph,
        persist_graph_snapshot=agentic_chat_mutations_enabled(),
    )

    return {
        "sessionId": active.id,
        "message": reply,
        "graph": active.graph,
        "pendingWeights": pending,
        "graphComplete": graph_is_complete(active.graph),
        "tokenUsage": active.token_usage,
        "supermemoryLoaded": active.supermemory_loaded,
    }


async def reset_session(session_id: str | None, container_tag: str, fresh: bool = False) -> Session:
    if session_id:
        _sessions.pop(session_id, None)
    return await create_session(container_tag, fresh)


async def update_edge_weight(
    session_id: str,
    edge_id: str,
    weight: float,
    container_tag: str,
) -> dict[str, Any] | None:
    session = get_session(session_id)
    if not session:
        return None

    edge = next((e for e in session.graph["edges"] if e["id"] == edge_id), None)
    if not edge:
        return None

    clamped = clamp_weight(weight)
    session.graph = apply_llm_delta(
        session.graph,
        {"assistant_message": "", "weight_updates": [{"edge_id": edge_id, "weight": clamped}]},
    )
    label_by_id = {n["id"]: n["label"] for n in session.graph["nodes"]}
    src = label_by_id.get(edge["source"], edge["source"])
    tgt = label_by_id.get(edge["target"], edge["target"])
    session.graph = sanitize_graph(session.graph)
    await persist_to_supermemory(
        container_tag,
        f"[graph] Set weight: {src} → {tgt}",
        f"Weight: {clamped}",
        session.graph,
    )

    pending = pending_weight_questions(session.graph)
    return {
        "sessionId": session.id,
        "message": "",
        "graph": session.graph,
        "pendingWeights": pending,
        "graphComplete": graph_is_complete(session.graph),
        "tokenUsage": session.token_usage,
        "supermemoryLoaded": session.supermemory_loaded,
    }
