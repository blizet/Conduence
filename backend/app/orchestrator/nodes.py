"""LangGraph node functions for the LLM Analyzer orchestrator."""

from __future__ import annotations

import time
from typing import Any

from app.lib.normalize import normalize_decision
from app.orchestrator.compile import compile_orchestrator
from app.orchestrator.decision_engine import DecisionEngine
from app.orchestrator.graph_registry import match_active_graph, resolve_correlation_graph
from app.orchestrator.llm_synthesize import synthesize_decision
from app.orchestrator.planner import plan_tool_calls
from app.orchestrator.state import OrchestratorState
from app.orchestrator.tools_registry import ToolRegistry
from app.schemas.decision import DecisionEvent
from app.tools.cot_builder import build_cot_decision


def _append_step(state: OrchestratorState, name: str) -> list[str]:
    steps = list(state.get("steps") or [])
    steps.append(name)
    return steps


def _normalize_signal(raw: dict[str, Any]) -> dict[str, Any]:
    signal = dict(raw)
    signal.setdefault("type", signal.get("event_type", "news"))
    signal.setdefault("agent", signal.get("agent", signal.get("agent_id", "unknown")))
    signal.setdefault("direction", signal.get("sentiment", "neutral"))
    signal.setdefault("strength", 0.7)
    if not signal.get("summary"):
        signal["summary"] = signal.get("headline", "")
    return signal


async def ingest_signal(state: OrchestratorState) -> dict[str, Any]:
    signal = _normalize_signal(state.get("signal") or {})
    config = state.get("config") or {}
    canvas = state.get("canvas") or {}
    compiled = compile_orchestrator(
        canvas.get("nodes") or [],
        canvas.get("edges") or [],
        config=config,
    )

    cot_output = next((o for o in compiled["output_nodes"] if o.get("type") == "cotBuilder"), None)
    cot_data = (cot_output or {}).get("data") or {}

    return {
        "signal": signal,
        "connected_tools": compiled["connected_tools"],
        "tool_configs": compiled["tool_configs"],
        "connected_subagents": compiled.get("connected_subagents") or [],
        "subagent_configs": compiled.get("subagent_configs") or {},
        "subagent_tools": compiled.get("subagent_tools") or {},
        "output_nodes": [o["type"] for o in compiled["output_nodes"] if o.get("type")],
        "tool_registry": compiled.get("tool_registry") or {},
        "graph_registry": compiled.get("graph_registry") or {},
        "skills_registry": compiled.get("skills_registry") or {},
        "skills": (compiled.get("skills_registry") or {}).get("skills") or [],
        "context_graph": compiled.get("context_graph") or "correlation",
        "config": {
            "feed_sources": compiled.get("feed_sources") or [],
            **config,
            "llm_config": compiled["llm_config"],
            "min_confidence": float(config.get("min_confidence", 0.55)),
            "portfolio_usd": float(config.get("portfolio_usd", 10_000)),
            "graphId": config.get("graphId") or cot_data.get("graphId") or compiled.get("graph_registry", {}).get("decision_graph_id"),
            "userNodeId": config.get("userNodeId") or cot_data.get("userNodeId"),
        },
        "recent_signals": state.get("recent_signals") or [],
        "diverging_nodes": state.get("diverging_nodes") or {},
        "tool_results": {},
        "rag_context": {},
        "errors": [],
        "evidence": [],
        "steps": _append_step(state, "ingest_signal"),
    }


def route_signal(state: OrchestratorState) -> str:
    signal = state.get("signal") or {}
    if signal.get("type") == "arbitrage":
        return "fast_path"
    if signal.get("type") == "divergence":
        return "context_only"
    if _signal_sign(signal) == 0.0 and signal.get("type") not in ("whale", "news"):
        return "context_only"
    return "deliberate"


async def fast_publish_arbitrage(state: OrchestratorState) -> dict[str, Any]:
    signal = state.get("signal") or {}
    opp = signal.get("opportunity", {})
    legs = signal.get("legs", {})
    suggestion = {
        "type": "trade_suggestion",
        "kind": "arbitrage",
        "market": legs.get("polymarket", {}).get("title", ""),
        "slug": legs.get("polymarket", {}).get("url", ""),
        "side": opp.get("direction", ""),
        "entry_price": opp.get("poly_ask"),
        "confidence": opp.get("match_confidence", 0.0),
        "asset": "market-neutral",
        "thesis": signal.get("summary", ""),
        "graph_path": [],
        "evidence": [
            f"polymarket leg: {legs.get('polymarket', {}).get('title', '')}",
            f"kalshi leg: {legs.get('kalshi', {}).get('title', '')}",
            f"net edge {opp.get('net_edge', 0) * 100:.1f}c/contract after fees",
        ],
        "ts": time.time(),
    }
    return {
        "fast_suggestion": suggestion,
        "suggestions": [suggestion],
        "decision": {
            "action": "HOLD",
            "market_id": "NONE",
            "conviction_level": int(round(suggestion["confidence"] * 10)),
            "thesis": suggestion["thesis"],
            "tags": ["#arbitrage"],
            "reasoning": "Arbitrage fast-path — market-neutral self-verifying opportunity.",
        },
        "published": True,
        "steps": _append_step(state, "fast_publish_arbitrage"),
    }


async def remember_signal(state: OrchestratorState) -> dict[str, Any]:
    signal = state.get("signal") or {}
    graph = resolve_correlation_graph(state.get("graph_registry"))
    engine = DecisionEngine(graph)
    recent = engine.remember(state.get("recent_signals") or [], signal)
    diverging = engine.update_divergence(state.get("diverging_nodes") or {}, signal)
    return {
        "recent_signals": recent,
        "diverging_nodes": diverging,
        "steps": _append_step(state, "remember_signal"),
    }


async def match_graph(state: OrchestratorState) -> dict[str, Any]:
    signal = state.get("signal") or {}
    registry = state.get("graph_registry") or {}
    impacts, rag = match_active_graph(
        registry,
        signal,
        state.get("recent_signals") or [],
    )
    return {
        "graph_impacts": impacts,
        "rag_context": rag,
        "steps": _append_step(state, "match_graph"),
    }


async def plan_tools(state: OrchestratorState) -> dict[str, Any]:
    connected = (state.get("tool_registry") or {}).get("connected") or state.get("connected_tools")
    registry = ToolRegistry(connected)
    graph = resolve_correlation_graph(state.get("graph_registry"))
    calls = plan_tool_calls(
        registry,
        graph,
        state.get("signal") or {},
        state.get("tool_configs") or {},
        connected_subagents=state.get("connected_subagents") or [],
    )
    return {"planned_calls": calls, "steps": _append_step(state, "plan_tools")}


async def invoke_tools(state: OrchestratorState) -> dict[str, Any]:
    connected = (state.get("tool_registry") or {}).get("connected") or state.get("connected_tools")
    registry = ToolRegistry(connected)
    results = await registry.invoke_parallel(state.get("planned_calls") or [])
    errors = [f"{k}: {v.get('error')}" for k, v in results.items() if not v.get("ok")]
    return {
        "tool_results": results,
        "errors": (state.get("errors") or []) + errors,
        "steps": _append_step(state, "invoke_tools"),
    }


async def evaluate(state: OrchestratorState) -> dict[str, Any]:
    graph = resolve_correlation_graph(state.get("graph_registry"))
    config = state.get("config") or {}
    engine = DecisionEngine(
        graph,
        min_confidence=float(config.get("min_confidence", 0.55)),
        portfolio_usd=float(config.get("portfolio_usd", 10_000)),
    )
    suggestions = engine.decide(
        state.get("signal") or {},
        state.get("recent_signals") or [],
        state.get("diverging_nodes") or {},
        state.get("tool_results") or {},
    )
    evidence: list[str] = []
    for s in suggestions:
        evidence.extend(s.get("evidence", []))
    return {
        "suggestions": suggestions,
        "evidence": evidence,
        "steps": _append_step(state, "evaluate"),
    }


async def llm_synthesize_node(state: OrchestratorState) -> dict[str, Any]:
    config = state.get("config") or {}
    llm_config = config.get("llm_config") or {}
    decision, correlated = await synthesize_decision(
        llm_config,
        state.get("signal") or {},
        state.get("suggestions") or [],
        state.get("tool_results") or {},
        state.get("evidence") or [],
        rag_context=state.get("rag_context") or {},
        skills=state.get("skills") or [],
        graph_registry=state.get("graph_registry") or {},
    )
    return {
        "decision": decision,
        "correlated": correlated,
        "steps": _append_step(state, "llm_synthesize"),
    }


async def publish_outputs(state: OrchestratorState) -> dict[str, Any]:
    decision = state.get("decision") or {}
    correlated = state.get("correlated") or {}
    config = state.get("config") or {}
    cot = None

    if "cotBuilder" in (state.get("output_nodes") or []) and decision.get("action") != "HOLD":
        draft = build_cot_decision(
            decision,
            correlated,
            {
                "graphId": config.get("graphId"),
                "userNodeId": config.get("userNodeId"),
            },
        )
        if draft:
            event = DecisionEvent.model_validate(draft)
            cot = normalize_decision(event).model_dump()

    return {"cot": cot, "published": True, "steps": _append_step(state, "publish_outputs")}


async def context_only(state: OrchestratorState) -> dict[str, Any]:
    return {
        "suggestions": [],
        "decision": {
            "action": "HOLD",
            "market_id": "NONE",
            "conviction_level": 1,
            "thesis": "Context update only — no trade trigger",
            "tags": [],
            "reasoning": "Divergence or neutral signal recorded for corroboration window.",
        },
        "published": False,
        "steps": _append_step(state, "context_only"),
    }
