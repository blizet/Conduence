from typing import Any, Callable

from app.falkordb.graph_delta import EdgeOperation, expand_edge_operations
from app.schemas.decision import DecisionEvent, GraphEdge

GraphQueryFn = Callable[[str, dict[str, Any] | None], Any]


def cypher_node_label(node_type: str) -> str:
    t = node_type.strip().lower()
    if not t:
        return "Entity"
    if t == "correlated_market":
        return "CorrelatedMarket"
    return t[0].upper() + t[1:]


async def _count_query(query: GraphQueryFn, cypher: str) -> int:
    result = await query(cypher, None)
    rows = getattr(result, "result_set", None) or []
    if not rows:
        return 0
    row = rows[0]
    if isinstance(row, (list, tuple)):
        return int(row[0] or 0)
    if isinstance(row, dict):
        return int(row.get("c", 0))
    return 0


async def execute_cypher_delta(
    query: GraphQueryFn,
    payload: DecisionEvent,
    *,
    edge_ops: list[EdgeOperation] | None = None,
    nodes_skipped: int = 0,
    edge_ops_skipped: int = 0,
) -> dict[str, int]:
    timestamp = payload.updated_at
    edges_before = await _count_query(query, "MATCH ()-[r]->() RETURN count(r) AS c")

    for node in payload.nodes:
        props = node.properties or {}
        anchor = 1 if props.get("anchor") is True else 0
        correlated_peer = 1 if props.get("correlated_peer") is True else 0
        await query(
            f"MERGE (n:{cypher_node_label(node.node_type)} {{node_id: $node_id}}) "
            "ON CREATE SET n.created_at = $timestamp, n.node_type = $node_type, "
            "              n.anchor = $anchor, n.correlated_peer = $correlated_peer "
            "ON MATCH SET n.last_seen_at = $timestamp, n.node_type = $node_type, "
            "             n.anchor = ($anchor > 0), n.correlated_peer = ($correlated_peer > 0)",
            {
                "node_id": node.node_id,
                "timestamp": timestamp,
                "node_type": node.node_type,
                "anchor": anchor,
                "correlated_peer": correlated_peer,
            },
        )

    ops = edge_ops if edge_ops is not None else expand_edge_operations(payload.edges)

    for op in ops:
        edge = op.edge
        meta = edge.metadata or {}
        rel_type = op.rel_type
        edge_timestamp = str(meta.get("timestamp", timestamp))
        tags = meta.get("tags", [])
        if not isinstance(tags, list):
            tags = []

        params = {
            "source_id": op.source,
            "target_id": op.target,
            "thesis": str(meta.get("thesis", "")),
            "conviction": float(meta.get("conviction_level", 0)),
            "tags": tags,
            "timestamp": edge_timestamp,
        }

        if op.is_reverse:
            await query(
                f"MATCH (s) WHERE s.node_id = $source_id "
                f"MATCH (t) WHERE t.node_id = $target_id "
                f"MERGE (s)-[r:{rel_type}]->(t) "
                "ON CREATE SET r.timestamp = $timestamp "
                "ON MATCH SET r.last_updated = $timestamp",
                params,
            )
            continue

        await query(
            f"MATCH (s) WHERE s.node_id = $source_id "
            f"MATCH (t) WHERE t.node_id = $target_id "
            f"MERGE (s)-[r:{rel_type}]->(t) "
            "ON CREATE SET r.thesis = $thesis, r.conviction = $conviction, "
            "              r.tags = $tags, r.timestamp = $timestamp "
            "ON MATCH SET r.last_updated = $timestamp",
            params,
        )

    edges_after = await _count_query(query, "MATCH ()-[r]->() RETURN count(r) AS c")
    edge_delta = edges_after - edges_before

    return {
        "nodes": len(payload.nodes),
        "edges": len(ops),
        "nodesCreated": len(payload.nodes),
        "edgesCreated": edge_delta,
        "nodesSkipped": nodes_skipped,
        "edgeOpsSkipped": edge_ops_skipped,
    }
