"""Build and compile the LangGraph orchestrator."""

from __future__ import annotations

from langgraph.graph import END, StateGraph

from app.orchestrator.nodes import (
    context_only,
    evaluate,
    fast_publish_arbitrage,
    ingest_signal,
    invoke_tools,
    llm_synthesize_node,
    match_graph,
    plan_tools,
    publish_outputs,
    remember_signal,
    route_signal,
)
from app.orchestrator.state import OrchestratorState

_compiled_graph = None


def build_orchestrator_graph():
    graph = StateGraph(OrchestratorState)

    graph.add_node("ingest_signal", ingest_signal)
    graph.add_node("fast_publish_arbitrage", fast_publish_arbitrage)
    graph.add_node("remember_signal", remember_signal)
    graph.add_node("match_graph", match_graph)
    graph.add_node("plan_tools", plan_tools)
    graph.add_node("invoke_tools", invoke_tools)
    graph.add_node("evaluate", evaluate)
    graph.add_node("llm_synthesize", llm_synthesize_node)
    graph.add_node("publish_outputs", publish_outputs)
    graph.add_node("context_only", context_only)

    graph.set_entry_point("ingest_signal")

    graph.add_conditional_edges(
        "ingest_signal",
        route_signal,
        {
            "fast_path": "fast_publish_arbitrage",
            "context_only": "remember_signal",
            "deliberate": "remember_signal",
        },
    )

    graph.add_edge("fast_publish_arbitrage", END)

    graph.add_conditional_edges(
        "remember_signal",
        route_signal,
        {
            "fast_path": "match_graph",
            "context_only": "context_only",
            "deliberate": "match_graph",
        },
    )

    graph.add_edge("context_only", END)
    graph.add_edge("match_graph", "plan_tools")
    graph.add_edge("plan_tools", "invoke_tools")
    graph.add_edge("invoke_tools", "evaluate")
    graph.add_edge("evaluate", "llm_synthesize")
    graph.add_edge("llm_synthesize", "publish_outputs")
    graph.add_edge("publish_outputs", END)

    return graph.compile()


def get_compiled_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_orchestrator_graph()
    return _compiled_graph
