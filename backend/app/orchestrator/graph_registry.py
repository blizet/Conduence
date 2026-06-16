"""Context graph registry — correlation graph + user decision graph."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from app.orchestrator.correlation_graph import CorrelationGraph, DEFAULT_GRAPH_PATH

ContextGraphId = Literal["correlation", "decision"]

GRAPH_CATALOG: dict[str, dict[str, str]] = {
    "correlation": {
        "label": "Correlation graph",
        "description": "Market context — asset/theme co-movement (CORRELATION_GRAPH_PATH or data/correlation/)",
        "source": "correlation_graph.json",
    },
    "decision": {
        "label": "Decision graph",
        "description": "User CoT graph in FalkorDB — all committed trade decisions",
        "source": "falkordb",
    },
}


@dataclass
class GraphSpec:
    id: ContextGraphId
    label: str
    description: str
    source: str
    graph_id: str | None = None
    node_count: int = 0
    edge_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "description": self.description,
            "source": self.source,
            "graph_id": self.graph_id,
            "node_count": self.node_count,
            "edge_count": self.edge_count,
        }


def build_graph_registry(
    *,
    active_id: ContextGraphId = "correlation",
    decision_graph_id: str | None = None,
    decision_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build serializable graph registry for OrchestratorState."""
    correlation = CorrelationGraph(DEFAULT_GRAPH_PATH)
    snapshot = decision_snapshot or {}
    snap_nodes = snapshot.get("nodes") or []
    snap_edges = snapshot.get("edges") or []

    specs: dict[str, GraphSpec] = {
        "correlation": GraphSpec(
            id="correlation",
            label=GRAPH_CATALOG["correlation"]["label"],
            description=GRAPH_CATALOG["correlation"]["description"],
            source=GRAPH_CATALOG["correlation"]["source"],
            node_count=len(correlation.nodes),
            edge_count=len(correlation.edges),
        ),
        "decision": GraphSpec(
            id="decision",
            label=GRAPH_CATALOG["decision"]["label"],
            description=GRAPH_CATALOG["decision"]["description"],
            source=GRAPH_CATALOG["decision"]["source"],
            graph_id=decision_graph_id,
            node_count=len(snap_nodes),
            edge_count=len(snap_edges),
        ),
    }

    if active_id not in specs:
        active_id = "correlation"

    return {
        "active_id": active_id,
        "available": [specs[k].to_dict() for k in ("correlation", "decision")],
        "decision_graph_id": decision_graph_id,
        "decision_snapshot": snapshot if active_id == "decision" or snap_nodes else {},
        "correlation_path": str(DEFAULT_GRAPH_PATH),
    }


def resolve_correlation_graph(_registry: dict[str, Any] | None = None) -> CorrelationGraph:
    return CorrelationGraph(DEFAULT_GRAPH_PATH)


def match_active_graph(
    registry: dict[str, Any],
    signal: dict[str, Any],
    recent_signals: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Return (graph_impacts, rag_context) for the active context graph."""
    active_id = registry.get("active_id") or "correlation"
    keywords = [str(k).lower() for k in signal.get("keywords", [])]
    text = (signal.get("summary") or signal.get("headline") or "").lower()
    tokens = set(keywords + text.split())

    if active_id == "decision":
        return _match_decision_graph(registry.get("decision_snapshot") or {}, tokens, signal)

    return _match_correlation_graph(tokens, signal)


def _match_correlation_graph(
    tokens: set[str],
    signal: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    from app.orchestrator.decision_engine import _signal_sign

    graph = resolve_correlation_graph()
    sign = _signal_sign(signal)
    text = " ".join(tokens)
    origins = graph.match_keywords(text)
    impacts: list[dict[str, Any]] = []
    for origin in origins:
        for impact in graph.propagate(origin.id, strength=sign or 1.0):
            impacts.append(
                {
                    "graph": "correlation",
                    "node_id": impact.node.id,
                    "node_type": impact.node.type,
                    "label": impact.node.label,
                    "score": impact.score,
                    "path": impact.path,
                    "rationale": impact.rationale,
                    "keywords": impact.node.keywords,
                    "coingecko_id": impact.node.coingecko_id,
                }
            )
    rag = {
        "graph": "correlation",
        "origins": [o.id for o in origins],
        "impacts": impacts[:24],
    }
    return impacts, rag


def _match_decision_graph(
    snapshot: dict[str, Any],
    tokens: set[str],
    signal: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    nodes = snapshot.get("nodes") or []
    edges = snapshot.get("edges") or []
    matched: list[dict[str, Any]] = []
    for node in nodes:
        node_id = str(node.get("id") or "")
        node_type = str(node.get("type") or "")
        haystack = f"{node_id} {node_type}".lower()
        if tokens and not any(t in haystack for t in tokens if len(t) > 2):
            continue
        matched.append(
            {
                "graph": "decision",
                "node_id": node_id,
                "node_type": node_type,
                "label": node_id,
                "score": 1.0,
                "path": [node_id],
                "rationale": f"Decision graph node matched signal context",
                "anchor": node.get("anchor"),
                "correlated_peer": node.get("correlated_peer"),
            }
        )
    rag = {
        "graph": "decision",
        "graph_id": snapshot.get("graph_id"),
        "matched_nodes": matched[:32],
        "edge_count": len(edges),
        "signal_type": signal.get("type"),
    }
    return matched, rag
