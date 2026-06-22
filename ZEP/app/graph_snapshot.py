"""Fetch a user's Zep graph and serialize it for the web UI."""
from __future__ import annotations

import time
from typing import Any

from zep_cloud.client import Zep

def _node_payload(node: Any) -> dict[str, Any]:
    labels = list(node.labels or [])
    return {
        "id": node.uuid_,
        "name": node.name,
        "labels": labels,
        "label": labels[0] if labels else "Entity",
        "summary": node.summary or "",
        "attributes": node.attributes or {},
    }


def _edge_payload(edge: Any) -> dict[str, Any]:
    return {
        "id": edge.uuid_,
        "name": edge.name,
        "fact": edge.fact or "",
        "source": edge.source_node_uuid,
        "target": edge.target_node_uuid,
        "attributes": edge.attributes or {},
    }


def fetch_user_graph(zep: Zep, user_id: str, *, limit: int = 200) -> dict[str, Any]:
    nodes_raw = zep.graph.node.get_by_user_id(user_id=user_id, limit=limit)
    edges_raw = zep.graph.edge.get_by_user_id(user_id=user_id, limit=limit)

    nodes = [_node_payload(node) for node in nodes_raw]
    edges = [_edge_payload(edge) for edge in edges_raw]

    return {
        "has_graph": len(nodes) > 0,
        "node_count": len(nodes),
        "edge_count": len(edges),
        "nodes": nodes,
        "edges": edges,
    }


def fetch_user_graph_with_retry(
    zep: Zep,
    user_id: str,
    *,
    limit: int = 200,
    attempts: int = 3,
) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            return fetch_user_graph(zep, user_id, limit=limit)
        except Exception as exc:  # noqa: BLE001 — retry transient Zep API failures
            last_error = exc
            if attempt < attempts - 1:
                time.sleep(0.4 * (attempt + 1))
    assert last_error is not None
    raise last_error
