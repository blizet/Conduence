"""High-level orchestrator entrypoint."""

from __future__ import annotations

from typing import Any

from app.orchestrator.graph import get_compiled_graph
from app.orchestrator.state import OrchestratorState


def normalize_inbound_signal(body: dict[str, Any]) -> dict[str, Any]:
    if "payload" in body and isinstance(body["payload"], dict):
        signal = dict(body["payload"])
        signal.setdefault("agent", body.get("agent_id", signal.get("agent")))
        signal.setdefault("type", body.get("event_type", signal.get("type", "news")))
        return signal
    return body.get("signal") or body


async def run_orchestrator(
    *,
    signal: dict[str, Any],
    canvas: dict[str, Any] | None = None,
    config: dict[str, Any] | None = None,
    memory: dict[str, Any] | None = None,
) -> dict[str, Any]:
    memory = memory or {}
    initial: OrchestratorState = {
        "signal": signal,
        "canvas": canvas or {"nodes": [], "edges": []},
        "config": config or {},
        "recent_signals": memory.get("recent_signals") or [],
        "diverging_nodes": memory.get("diverging_nodes") or {},
        "steps": [],
    }

    compiled = get_compiled_graph()
    final_state = await compiled.ainvoke(initial)

    return {
        "ok": True,
        "steps": final_state.get("steps") or [],
        "signal": final_state.get("signal"),
        "suggestions": final_state.get("suggestions") or [],
        "decision": final_state.get("decision"),
        "cot": final_state.get("cot"),
        "correlated": final_state.get("correlated"),
        "tool_results": final_state.get("tool_results") or {},
        "graph_impacts": final_state.get("graph_impacts") or [],
        "evidence": final_state.get("evidence") or [],
        "errors": final_state.get("errors") or [],
        "fast_suggestion": final_state.get("fast_suggestion"),
        "context_graph": final_state.get("context_graph"),
        "graph_registry": final_state.get("graph_registry"),
        "skills": final_state.get("skills") or [],
        "skills_registry": final_state.get("skills_registry"),
        "tool_registry": final_state.get("tool_registry"),
        "rag_context": final_state.get("rag_context"),
        "memory": {
            "recent_signals": final_state.get("recent_signals") or [],
            "diverging_nodes": final_state.get("diverging_nodes") or {},
        },
    }
