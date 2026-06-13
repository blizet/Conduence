"""Shared LangGraph state for the LLM Analyzer orchestrator."""

from __future__ import annotations

from typing import Any, TypedDict


class OrchestratorState(TypedDict, total=False):
    signal: dict[str, Any]
    config: dict[str, Any]
    canvas: dict[str, Any]
    connected_tools: list[str]
    tool_configs: dict[str, dict[str, Any]]
    connected_subagents: list[str]
    subagent_configs: dict[str, dict[str, Any]]
    subagent_tools: dict[str, list[str]]
    output_nodes: list[str]
    route: str
    recent_signals: list[dict[str, Any]]
    graph_impacts: list[dict[str, Any]]
    planned_calls: list[dict[str, Any]]
    tool_results: dict[str, Any]
    suggestions: list[dict[str, Any]]
    decision: dict[str, Any] | None
    cot: dict[str, Any] | None
    correlated: dict[str, Any]
    evidence: list[str]
    errors: list[str]
    published: bool
    fast_suggestion: dict[str, Any] | None
    steps: list[str]
    # Compile-time registries (populated at ingest_signal)
    tool_registry: dict[str, Any]
    graph_registry: dict[str, Any]
    skills_registry: dict[str, Any]
    skills: list[str]
    rag_context: dict[str, Any]
    context_graph: str
