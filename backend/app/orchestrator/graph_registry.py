"""Context graph registry — correlation, user decision, and whale-shared graphs."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from app.orchestrator.correlation_graph import CorrelationGraph, DEFAULT_GRAPH_PATH

ContextGraphId = Literal["correlation", "decision", "whale_context"]

_REPO_ROOT = Path(__file__).resolve().parents[3]
WHALE_WALLETS_PATH = _REPO_ROOT / "config" / "whale-wallets.json"

GRAPH_CATALOG: dict[str, dict[str, str]] = {
    "correlation": {
        "label": "Correlation graph",
        "description": "cry market context — asset/theme co-movement (correlation_graph.json)",
        "source": "cry/graph/correlation_graph.json",
    },
    "decision": {
        "label": "Decision graph",
        "description": "User CoT graph in FalkorDB — all committed trade decisions",
        "source": "falkordb",
    },
    "whale_context": {
        "label": "Whale context graph",
        "description": "Shared whale-wallet context — tracked proxies and wallet-linked markets",
        "source": "config/whale-wallets.json",
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
    wallets: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "description": self.description,
            "source": self.source,
            "graph_id": self.graph_id,
            "node_count": self.node_count,
            "edge_count": self.edge_count,
            "wallets": self.wallets,
        }


def _load_whale_wallets(extra: list[str] | None = None) -> list[str]:
    wallets: list[str] = []
    if WHALE_WALLETS_PATH.is_file():
        try:
            raw = json.loads(WHALE_WALLETS_PATH.read_text())
            for entry in raw if isinstance(raw, list) else []:
                w = (entry.get("proxyWallet") or entry.get("wallet") or "").strip()
                if w:
                    wallets.append(w)
        except (json.JSONDecodeError, OSError):
            pass
    for w in extra or []:
        w = w.strip()
        if w and w not in wallets:
            wallets.append(w)
    return wallets


def build_graph_registry(
    *,
    active_id: ContextGraphId = "correlation",
    decision_graph_id: str | None = None,
    decision_snapshot: dict[str, Any] | None = None,
    canvas_whale_wallets: list[str] | None = None,
) -> dict[str, Any]:
    """Build serializable graph registry for OrchestratorState."""
    correlation = CorrelationGraph(DEFAULT_GRAPH_PATH)
    wallets = _load_whale_wallets(canvas_whale_wallets)
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
        "whale_context": GraphSpec(
            id="whale_context",
            label=GRAPH_CATALOG["whale_context"]["label"],
            description=GRAPH_CATALOG["whale_context"]["description"],
            source=GRAPH_CATALOG["whale_context"]["source"],
            wallets=wallets,
            node_count=len(wallets),
        ),
    }

    if active_id not in specs:
        active_id = "correlation"

    return {
        "active_id": active_id,
        "available": [specs[k].to_dict() for k in ("correlation", "decision", "whale_context")],
        "decision_graph_id": decision_graph_id,
        "decision_snapshot": snapshot if active_id == "decision" or snap_nodes else {},
        "whale_wallets": wallets,
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

    if active_id == "whale_context":
        return _match_whale_context(registry, signal, recent_signals or [])

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


def _match_whale_context(
    registry: dict[str, Any],
    signal: dict[str, Any],
    recent_signals: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    wallets = registry.get("whale_wallets") or []
    impacts: list[dict[str, Any]] = []
    for i, wallet in enumerate(wallets):
        impacts.append(
            {
                "graph": "whale_context",
                "node_id": wallet,
                "node_type": "wallet",
                "label": wallet[:10] + "…" + wallet[-4:] if len(wallet) > 16 else wallet,
                "score": 1.0 - i * 0.05,
                "path": [wallet],
                "rationale": "Tracked whale proxy wallet",
            }
        )

    whale_feed = [s for s in recent_signals if s.get("type") == "whale" or s.get("agent") == "whaleWallet"]
    if signal.get("type") == "whale":
        whale_feed = [signal, *whale_feed]

    rag = {
        "graph": "whale_context",
        "wallets": wallets,
        "recent_whale_signals": whale_feed[:8],
        "wallet_count": len(wallets),
    }
    return impacts, rag
