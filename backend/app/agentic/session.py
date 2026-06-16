"""In-memory agentic graph chat sessions."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

from app.agentic.config import LlmConfig, is_supermemory_configured
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
from app.agentic.memory import fetch_supermemory_context, load_graph_from_supermemory, persist_to_supermemory
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


def _welcome_message(supermemory_loaded: bool, edge_count: int, fresh: bool) -> str:
    if fresh:
        return (
            "Starting a fresh session. Tell me about the causal relationships you're thinking through — "
            "markets, geopolitics, assets, events — and we'll build the graph together. Once links appear "
            "on the graph, you can click any edge to set its weight with the sidebar slider (−1 to 1), "
            "or keep chatting here if you prefer."
        )
    sm = ""
    if supermemory_loaded:
        sm = f"I've restored your prior graph ({edge_count} edge{'s' if edge_count != 1 else ''}). "
    elif is_supermemory_configured():
        sm = "Supermemory is connected, so your graph will persist across sessions. "
    return (
        f"{sm}What would you like to add or refine? Describe relationships in your own words — "
        "and click edges on the graph anytime to adjust weights (−1 to 1) in the sidebar."
    )


async def create_session(container_tag: str, fresh: bool = False) -> Session:
    graph = create_empty_graph()
    supermemory_loaded = False

    if not fresh and is_supermemory_configured():
        hydrated = await load_graph_from_supermemory(container_tag)
        if hydrated["nodes"] or hydrated["edges"]:
            graph = sanitize_graph(hydrated)
            supermemory_loaded = True

    session = Session(
        id=str(uuid.uuid4()),
        messages=[
            {
                "role": "assistant",
                "content": _welcome_message(supermemory_loaded, len(graph["edges"]), fresh),
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

    if llm_result:
        active.graph = apply_llm_delta(active.graph, llm_result)
        active.graph = supplement_graph_from_prose(active.graph, user_message)
        active.graph = supplement_graph_from_text(active.graph, user_message)
        active.graph = apply_weights_from_quoted_context(
            active.graph,
            llm_result.get("assistant_message", ""),
            user_message,
        )
        _apply_local_batch_weight_fallback(active, user_message)

    active.graph = sanitize_graph(active.graph)
    pending = pending_weight_questions(active.graph)
    reply = (llm_result or {}).get("assistant_message", "").strip() or (
        "LLM unavailable — check provider/key in settings."
    )

    active.messages.append({"role": "assistant", "content": reply})
    await persist_to_supermemory(container_tag, user_message, reply, active.graph)

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
