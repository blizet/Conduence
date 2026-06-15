"""Build provenance.execution bundles for CoT decisions (LangSmith-ready)."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any


def _langsmith_block(*, trace_id: str | None = None, run_id: str | None = None) -> dict[str, Any]:
    """Prefer live LangSmith run tree when LangGraph tracing is enabled."""
    if trace_id is None and run_id is None:
        try:
            from langsmith.run_helpers import get_current_run_tree

            run = get_current_run_tree()
            if run is not None:
                trace_id = str(run.trace_id) if run.trace_id else None
                run_id = str(run.id) if run.id else None
        except Exception:
            pass

    project = (os.getenv("LANGCHAIN_PROJECT") or "cot-workflows").strip()
    tracing_on = (os.getenv("LANGCHAIN_TRACING_V2") or "").strip().lower() in ("1", "true", "yes")
    url: str | None = None
    if run_id:
        url = f"https://smith.langchain.com/o/default/projects/p/{project}/r/{run_id}"

    block: dict[str, Any] = {
        "project": project,
        "trace_id": trace_id,
        "run_id": run_id,
        "url": url,
    }
    if not trace_id and not run_id:
        block["status"] = "connected" if tracing_on and os.getenv("LANGCHAIN_API_KEY") else "pending_integration"
    return block


def _tools_from_results(tool_results: dict[str, Any] | None) -> list[dict[str, Any]]:
    tools: list[dict[str, Any]] = []
    for tool_id, result in (tool_results or {}).items():
        if not isinstance(result, dict):
            continue
        entry: dict[str, Any] = {
            "tool_id": tool_id,
            "ok": bool(result.get("ok")),
        }
        if result.get("error"):
            entry["error"] = str(result["error"])
        if result.get("latency_ms") is not None:
            entry["latency_ms"] = int(result["latency_ms"])
        tools.append(entry)
    return tools


def _agents_from_context(
    *,
    signal: dict[str, Any] | None,
    path: str,
) -> list[dict[str, Any]]:
    agents: list[dict[str, Any]] = []
    signal = signal or {}
    agent_id = (signal.get("agent") or signal.get("agent_id") or "").strip()
    if agent_id:
        agents.append(
            {
                "agent_id": agent_id,
                "role": "subagent",
                "contribution": "signal",
            }
        )
    if path == "orchestrator":
        agents.append(
            {
                "agent_id": "orchestrator",
                "role": "synthesizer",
                "contribution": "final_decision",
            }
        )
    elif path == "subagent_direct" and agent_id:
        agents[0]["contribution"] = "direct_cot"
    return agents


def build_execution_provenance(
    *,
    steps: list[str] | None = None,
    tool_results: dict[str, Any] | None = None,
    signal: dict[str, Any] | None = None,
    workflow_id: str | None = None,
    path: str = "orchestrator",
    langsmith: dict[str, Any] | None = None,
    llm_usage: dict[str, Any] | None = None,
    started_at: str | None = None,
    finished_at: str | None = None,
    duration_ms: int | None = None,
) -> dict[str, Any]:
    """Summarized execution record stored under provenance.execution on each decision."""
    signal = signal or {}
    finished = finished_at or datetime.now(timezone.utc).isoformat()
    ls = langsmith or _langsmith_block()

    execution: dict[str, Any] = {
        "schema_version": "1.0",
        "langsmith": ls,
        "workflow": {
            "workflow_id": workflow_id,
            "signal_id": signal.get("id") or signal.get("signal_id"),
            "path": path,
        },
        "agents": _agents_from_context(signal=signal, path=path),
        "tools": _tools_from_results(tool_results),
        "llm_usage": llm_usage
        or {
            "total_input_tokens": 0,
            "total_output_tokens": 0,
            "total_cost_usd": 0.0,
            "calls": [],
        },
        "steps": list(steps or []),
        "finished_at": finished,
    }
    if started_at:
        execution["started_at"] = started_at
    if duration_ms is not None:
        execution["duration_ms"] = duration_ms
    return execution


def merge_provenance(
    existing: dict[str, Any] | None,
    *,
    execution: dict[str, Any],
    raw_sources: list[str] | None = None,
) -> dict[str, Any]:
    provenance = dict(existing or {})
    if raw_sources:
        provenance["raw_sources"] = list(raw_sources)
    provenance["execution"] = execution
    return provenance
