from dataclasses import dataclass
from typing import Any

from app.schemas.decision import DecisionEvent, GraphEdge


@dataclass
class EdgeOperation:
    source: str
    target: str
    rel_type: str
    edge: GraphEdge
    target_id: str
    is_reverse: bool


def edge_key(source: str, rel_type: str, target: str) -> str:
    return f"{source}|{rel_type}|{target}"


def cypher_rel_type(edge: GraphEdge) -> str:
    if edge.Action:
        return edge.Action.replace(" ", "_").upper()
    rel = edge.relationship_type or str(edge.metadata.get("relationship_type", "RELATED_TO"))
    cleaned = "".join(c if c.isalnum() or c == "_" else "_" for c in rel.upper())
    return cleaned or "RELATED_TO"


def snapshot_from_rows(
    nodes: list[dict[str, str]],
    edges: list[dict[str, str]],
) -> dict[str, set[str]]:
    return {
        "nodeIds": {n["id"] for n in nodes},
        "edgeKeys": {edge_key(e["source"], e["type"], e["target"]) for e in edges},
    }


def _target_ids(edge: GraphEdge) -> list[str]:
    if edge.target:
        return [edge.target]
    return list(edge.targets or [])


def expand_edge_operations(edges: list[GraphEdge]) -> list[EdgeOperation]:
    ops: list[EdgeOperation] = []
    seen: set[str] = set()

    for edge in edges:
        if edge.metadata.get("direction") == "reverse":
            continue
        rel_type = cypher_rel_type(edge)
        for target_id in _target_ids(edge):
            forward_key = edge_key(edge.source, rel_type, target_id)
            if forward_key not in seen:
                seen.add(forward_key)
                ops.append(
                    EdgeOperation(
                        source=edge.source,
                        target=target_id,
                        rel_type=rel_type,
                        edge=edge,
                        target_id=target_id,
                        is_reverse=False,
                    )
                )
            if edge.direction == "bi-directional":
                reverse_key = edge_key(target_id, rel_type, edge.source)
                if reverse_key not in seen:
                    seen.add(reverse_key)
                    ops.append(
                        EdgeOperation(
                            source=target_id,
                            target=edge.source,
                            rel_type=rel_type,
                            edge=edge,
                            target_id=target_id,
                            is_reverse=True,
                        )
                    )
    return ops


def compute_graph_delta(snapshot: dict[str, set[str]], payload: DecisionEvent) -> dict[str, Any]:
    nodes = [n for n in payload.nodes if n.node_id not in snapshot["nodeIds"]]
    all_ops = expand_edge_operations(payload.edges)
    edge_ops = [
        op
        for op in all_ops
        if edge_key(op.source, op.rel_type, op.target) not in snapshot["edgeKeys"]
    ]
    return {
        "nodes": nodes,
        "edgeOps": edge_ops,
        "stats": {
            "nodesSkipped": len(payload.nodes) - len(nodes),
            "edgeOpsSkipped": len(all_ops) - len(edge_ops),
            "nodesNew": len(nodes),
            "edgeOpsNew": len(edge_ops),
        },
    }
