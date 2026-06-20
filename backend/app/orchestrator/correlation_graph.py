"""Correlation graph engine — ported from cry/graph/graph.py."""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[3]


def _resolve_graph_path(raw: str | Path) -> Path:
    path = Path(raw)
    if path.is_absolute():
        return path
    return _REPO_ROOT / path


DEFAULT_GRAPH_PATH = _resolve_graph_path(
    os.getenv("CORRELATION_GRAPH_PATH", "data/agentic/macro_correlation_graph.json")
)
HOP_DECAY = 0.6


def _load_graph_json(path: Path | str) -> dict:
    graph_path = Path(path)
    try:
        raw = json.loads(graph_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        logger.warning("Correlation graph not found at %s — empty graph", graph_path)
        return {"nodes": [], "edges": []}
    except json.JSONDecodeError as exc:
        logger.warning("Invalid correlation graph JSON at %s (%s) — empty graph", graph_path, exc)
        return {"nodes": [], "edges": []}

    nodes = raw.get("nodes") or []
    edges = raw.get("edges") or []
    if nodes and isinstance(nodes[0], dict) and nodes[0].get("type") in {
        "event",
        "asset",
        "market",
        "concept",
    }:
        converted_nodes = []
        for node in nodes:
            node_id = str(node["id"])
            label = str(node.get("label") or node_id)
            converted_nodes.append(
                {
                    "id": node_id,
                    "type": node.get("type", "asset"),
                    "label": label,
                    "keywords": [label.lower(), node_id.replace("_", " ")],
                }
            )
        converted_edges = []
        for edge in edges:
            converted_edges.append(
                {
                    "source": str(edge["source"]),
                    "target": str(edge["target"]),
                    "weight": float(edge.get("weight") or 0),
                    "direction": "bi",
                    "rationale": edge.get("label") or "",
                }
            )
        return {"nodes": converted_nodes, "edges": converted_edges}
    return raw


@dataclass
class GraphNode:
    id: str
    type: str
    label: str
    keywords: list[str] = field(default_factory=list)
    coingecko_id: str | None = None


@dataclass
class GraphEdge:
    source: str
    target: str
    weight: float
    direction: str = "bi"
    rationale: str = ""


@dataclass
class Impact:
    node: GraphNode
    score: float
    path: list[str]
    rationale: str


class CorrelationGraph:
    def __init__(self, path: Path | str = DEFAULT_GRAPH_PATH):
        raw = _load_graph_json(_resolve_graph_path(path))
        self.nodes: dict[str, GraphNode] = {
            n["id"]: GraphNode(
                id=n["id"],
                type=n["type"],
                label=n.get("label", n["id"]),
                keywords=[k.lower() for k in n.get("keywords", [])],
                coingecko_id=n.get("coingecko_id"),
            )
            for n in raw["nodes"]
        }
        self.edges: list[GraphEdge] = [
            GraphEdge(
                source=e["source"],
                target=e["target"],
                weight=float(e["weight"]),
                direction=e.get("direction", "bi"),
                rationale=e.get("rationale", ""),
            )
            for e in raw["edges"]
        ]
        self._adj: dict[str, list[tuple[str, float, str]]] = {n: [] for n in self.nodes}
        for edge in self.edges:
            if edge.source in self._adj:
                self._adj[edge.source].append((edge.target, edge.weight, edge.rationale))
            if edge.direction == "bi" and edge.target in self._adj:
                self._adj[edge.target].append((edge.source, edge.weight, edge.rationale))

    def match_keywords(self, text_or_keywords: str | list[str]) -> list[GraphNode]:
        if isinstance(text_or_keywords, str):
            text = text_or_keywords.lower()
        else:
            text = " ".join(text_or_keywords).lower()
        return [
            node
            for node in self.nodes.values()
            if any(kw in text for kw in node.keywords) or node.id in text
        ]

    def neighbors(self, node_id: str, min_abs_weight: float = 0.0) -> list[tuple[GraphNode, float, str]]:
        out = []
        for nid, weight, why in self._adj.get(node_id, []):
            if abs(weight) >= min_abs_weight and nid in self.nodes:
                out.append((self.nodes[nid], weight, why))
        return sorted(out, key=lambda t: -abs(t[1]))

    def propagate(
        self,
        origin_id: str,
        strength: float = 1.0,
        max_hops: int = 2,
        min_abs_score: float = 0.2,
    ) -> list[Impact]:
        if origin_id not in self.nodes:
            return []

        best: dict[str, Impact] = {
            origin_id: Impact(self.nodes[origin_id], strength, [origin_id], "origin")
        }
        frontier = [(origin_id, strength, [origin_id])]

        for _ in range(max_hops):
            next_frontier = []
            for nid, score, path in frontier:
                for neigh_id, weight, why in self._adj.get(nid, []):
                    if neigh_id in path:
                        continue
                    decay = HOP_DECAY ** (len(path) - 1)
                    new_score = score * weight * decay
                    if abs(new_score) < min_abs_score:
                        continue
                    prev = best.get(neigh_id)
                    if prev is None or abs(new_score) > abs(prev.score):
                        impact = Impact(
                            self.nodes[neigh_id],
                            round(new_score, 4),
                            path + [neigh_id],
                            why,
                        )
                        best[neigh_id] = impact
                        next_frontier.append((neigh_id, new_score, path + [neigh_id]))
            frontier = next_frontier

        return sorted(best.values(), key=lambda i: -abs(i.score))
