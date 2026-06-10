"""Correlation graph engine.

Loads the user-editable `correlation_graph.json` and answers the two
questions the orchestrator needs:

1. Which nodes does this text/keyword set touch?  (match_keywords)
2. If node X moves with strength S, what else moves and how much?  (propagate)

Edge weight is correlation in [-1, 1]; negative = inverse relation.
Propagation multiplies weights along paths and keeps the strongest
signed path per node, with a decay factor per hop so second-order
effects are always weaker than first-order ones.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_GRAPH_PATH = Path(__file__).parent / "correlation_graph.json"
HOP_DECAY = 0.6  # second-order effects count 60% of the raw weight product


@dataclass
class Node:
    id: str
    type: str  # asset | theme | event
    label: str
    keywords: list[str] = field(default_factory=list)
    coingecko_id: str | None = None


@dataclass
class Edge:
    source: str
    target: str
    weight: float
    direction: str = "bi"  # bi | uni
    rationale: str = ""


@dataclass
class Impact:
    node: Node
    score: float          # signed propagated strength in [-1, 1]
    path: list[str]       # node ids from origin to this node
    rationale: str        # rationale of the last edge on the path


class CorrelationGraph:
    def __init__(self, path: Path | str = DEFAULT_GRAPH_PATH):
        raw = json.loads(Path(path).read_text())
        self.nodes: dict[str, Node] = {
            n["id"]: Node(
                id=n["id"],
                type=n["type"],
                label=n.get("label", n["id"]),
                keywords=[k.lower() for k in n.get("keywords", [])],
                coingecko_id=n.get("coingecko_id"),
            )
            for n in raw["nodes"]
        }
        self.edges: list[Edge] = [
            Edge(
                source=e["source"],
                target=e["target"],
                weight=float(e["weight"]),
                direction=e.get("direction", "bi"),
                rationale=e.get("rationale", ""),
            )
            for e in raw["edges"]
        ]
        # adjacency: node_id -> list[(neighbor_id, weight, rationale)]
        self._adj: dict[str, list[tuple[str, float, str]]] = {n: [] for n in self.nodes}
        for e in self.edges:
            if e.source in self._adj:
                self._adj[e.source].append((e.target, e.weight, e.rationale))
            if e.direction == "bi" and e.target in self._adj:
                self._adj[e.target].append((e.source, e.weight, e.rationale))

    # ------------------------------------------------------------------
    def match_keywords(self, text_or_keywords: str | list[str]) -> list[Node]:
        """Map free text or a keyword list onto graph nodes."""
        if isinstance(text_or_keywords, str):
            text = text_or_keywords.lower()
        else:
            text = " ".join(text_or_keywords).lower()
        hits = []
        for node in self.nodes.values():
            if any(kw in text for kw in node.keywords) or node.id in text:
                hits.append(node)
        return hits

    def neighbors(self, node_id: str, min_abs_weight: float = 0.0) -> list[tuple[Node, float, str]]:
        out = []
        for nid, w, why in self._adj.get(node_id, []):
            if abs(w) >= min_abs_weight and nid in self.nodes:
                out.append((self.nodes[nid], w, why))
        return sorted(out, key=lambda t: -abs(t[1]))

    def propagate(
        self,
        origin_id: str,
        strength: float = 1.0,
        max_hops: int = 2,
        min_abs_score: float = 0.2,
    ) -> list[Impact]:
        """BFS from origin multiplying signed weights, decaying per hop.

        Returns every node reachable within `max_hops` whose propagated
        |score| >= min_abs_score, strongest first. Origin is included
        with score == strength so callers get one uniform list.
        """
        if origin_id not in self.nodes:
            return []

        best: dict[str, Impact] = {
            origin_id: Impact(self.nodes[origin_id], strength, [origin_id], "origin")
        }
        frontier = [(origin_id, strength, [origin_id])]

        for _ in range(max_hops):
            next_frontier = []
            for nid, score, path in frontier:
                for neigh_id, w, why in self._adj.get(nid, []):
                    if neigh_id in path:
                        continue
                    decay = HOP_DECAY ** (len(path) - 1)
                    new_score = score * w * decay
                    if abs(new_score) < min_abs_score:
                        continue
                    prev = best.get(neigh_id)
                    if prev is None or abs(new_score) > abs(prev.score):
                        impact = Impact(self.nodes[neigh_id], round(new_score, 4), path + [neigh_id], why)
                        best[neigh_id] = impact
                        next_frontier.append((neigh_id, new_score, path + [neigh_id]))
            frontier = next_frontier

        return sorted(best.values(), key=lambda i: -abs(i.score))

    def impacted_assets(self, origin_id: str, strength: float = 1.0) -> list[Impact]:
        """Like propagate() but only asset nodes (the tradeable ones)."""
        return [i for i in self.propagate(origin_id, strength) if i.node.type == "asset"]


if __name__ == "__main__":
    g = CorrelationGraph()
    print("nodes:", len(g.nodes), "edges:", len(g.edges))
    for imp in g.propagate("trump_crypto_policy"):
        print(f"  {imp.score:+.2f}  {' -> '.join(imp.path)}")
