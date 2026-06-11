"""Build and compile the LangGraph scanner orchestrator.

  ingest_tick
      │ route_tick
      ├── manage_position ──► publish_outputs ─► END
      ├── evaluate_entry
      │       │ route_entry
      │       ├── enter_position ─► publish_outputs ─► END
      │       └── context_only ───────────────────────► END
      └── context_only ───────────────────────────────► END
"""

from __future__ import annotations

from langgraph.graph import END, StateGraph

from app.orchestrator.nodes import (
    context_only,
    enter_position,
    evaluate_entry,
    ingest_tick,
    manage_position,
    publish_outputs,
    route_entry,
    route_tick,
)
from app.orchestrator.state import ScannerState

_compiled_graph = None


def build_scanner_graph():
    graph = StateGraph(ScannerState)

    graph.add_node("ingest_tick", ingest_tick)
    graph.add_node("evaluate_entry", evaluate_entry)
    graph.add_node("enter_position", enter_position)
    graph.add_node("manage_position", manage_position)
    graph.add_node("context_only", context_only)
    graph.add_node("publish_outputs", publish_outputs)

    graph.set_entry_point("ingest_tick")

    graph.add_conditional_edges(
        "ingest_tick",
        route_tick,
        {
            "manage_position": "manage_position",
            "evaluate_entry": "evaluate_entry",
            "context_only": "context_only",
        },
    )

    graph.add_conditional_edges(
        "evaluate_entry",
        route_entry,
        {
            "enter_position": "enter_position",
            "context_only": "context_only",
        },
    )

    graph.add_edge("enter_position", "publish_outputs")
    graph.add_edge("manage_position", "publish_outputs")
    graph.add_edge("publish_outputs", END)
    graph.add_edge("context_only", END)

    return graph.compile()


def get_compiled_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_scanner_graph()
    return _compiled_graph
