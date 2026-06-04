from __future__ import annotations

import re
from copy import deepcopy
from typing import Any

from cot_kb.graph_topology import (
    agent_node_id,
    graph_id_for,
    parse_graph_id,
    user_slug_from_node_id,
)

AGENT_NODE_ID = "publisher_agent"
AGENT_DISPLAY_ID = "Publisher Agent"

LABEL_MAP = {
    "user": "User",
    "protocol": "Protocol",
    "market": "Market",
    "trade": "Trade",
    "outcome": "Outcome",
    "feedback": "Feedback",
    "agent": "Agent",
}


def _slug(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "_", value).strip("_").lower()


def _primary_user_node_id(nodes: list[dict[str, Any]]) -> str | None:
    for n in nodes:
        if n.get("node_type") == "user":
            return n["node_id"]
    return None


def _infer_decision_id(edges: list[dict[str, Any]], updated_at: str) -> str:
    for edge in edges:
        if edge.get("Action"):
            trade = edge.get("target")
            if trade:
                return f"dec-{_slug(trade)}"
    ts = updated_at.replace(":", "").replace("-", "")
    return f"dec-{ts}"


def _action_to_relationship(action: str) -> str:
    return re.sub(r"\s+", "_", action.strip().upper())


def _remap_legacy_agent(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    agent_id: str,
) -> None:
    node_ids = {n["node_id"] for n in nodes}
    if AGENT_NODE_ID not in node_ids and agent_id not in node_ids:
        referenced = any(
            e.get("source") in (AGENT_NODE_ID, AGENT_DISPLAY_ID)
            or e.get("target") in (AGENT_NODE_ID, AGENT_DISPLAY_ID)
            for e in edges
        )
        if referenced:
            nodes.append(
                {
                    "node_id": agent_id,
                    "node_type": "agent",
                    "properties": {"display_name": AGENT_DISPLAY_ID, "role": "publisher"},
                }
            )

    for n in nodes:
        if n["node_id"] == AGENT_NODE_ID:
            n["node_id"] = agent_id

    for e in edges:
        if e.get("source") in (AGENT_NODE_ID, AGENT_DISPLAY_ID):
            e["source"] = agent_id
        if e.get("target") in (AGENT_NODE_ID, AGENT_DISPLAY_ID):
            e["target"] = agent_id
        if e.get("targets"):
            e["targets"] = [
                agent_id if t in (AGENT_NODE_ID, AGENT_DISPLAY_ID) else t for t in e["targets"]
            ]


def _ensure_has_agent(
    edges: list[dict[str, Any]], user_node_id: str, agent_id: str, role: str
) -> None:
    if any(
        e.get("source") == user_node_id
        and e.get("target") == agent_id
        and e.get("relationship_type") == "HAS_AGENT"
        for e in edges
    ):
        return
    edges.insert(
        0,
        {
            "source": user_node_id,
            "target": agent_id,
            "relationship_type": "HAS_AGENT",
            "metadata": {"role": role},
        },
    )


def normalize_decision(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize a single decision event for validation and ingest."""
    payload = deepcopy(raw)
    payload.setdefault("schema_version", "1.0")
    payload.setdefault("operation", "assert")

    nodes: list[dict[str, Any]] = list(payload.get("nodes") or [])
    edges: list[dict[str, Any]] = list(payload.get("edges") or [])

    parsed = parse_graph_id(payload.get("graph_id", ""))
    user_node_id = _primary_user_node_id(nodes)
    if parsed:
        user_slug, role, _version = parsed
        agent_id = agent_node_id(user_slug, role)
        if user_node_id:
            _remap_legacy_agent(nodes, edges, agent_id)
            _ensure_has_agent(edges, user_node_id, agent_id, role)
    elif user_node_id:
        user_slug = user_slug_from_node_id(user_node_id)
        agent_id = agent_node_id(user_slug, "publisher")
        payload["graph_id"] = graph_id_for(user_slug, "publisher")
        _remap_legacy_agent(nodes, edges, agent_id)
        _ensure_has_agent(edges, user_node_id, agent_id, "publisher")

    normalized_edges: list[dict[str, Any]] = []
    for edge in edges:
        e = deepcopy(edge)
        rel = e.get("relationship_type")
        if not rel and e.get("Action"):
            rel = _action_to_relationship(e["Action"])
            e["relationship_type"] = rel
        if not rel:
            meta = e.get("metadata") or {}
            rel = meta.get("relationship_type") or "CONNECTED_TO"
            e["relationship_type"] = _action_to_relationship(str(rel))
        normalized_edges.append(e)

    expanded: list[dict[str, Any]] = []
    for e in normalized_edges:
        expanded.append(e)
        if e.get("direction") == "bi-directional":
            targets = [e["target"]] if e.get("target") else list(e.get("targets") or [])
            rel = e.get("relationship_type", "CONNECTED_TO")
            for target_id in targets:
                expanded.append(
                    {
                        "source": target_id,
                        "target": e["source"],
                        "relationship_type": rel,
                        "metadata": {
                            **(e.get("metadata") or {}),
                            "direction": "reverse",
                        },
                    }
                )
    normalized_edges = expanded

    payload["nodes"] = nodes
    payload["edges"] = normalized_edges
    if not payload.get("decision_id"):
        payload["decision_id"] = _infer_decision_id(normalized_edges, payload["updated_at"])

    for n in payload["nodes"]:
        n.setdefault("properties", {})
        n["label"] = LABEL_MAP.get(n["node_type"], "Entity")

    for e in payload["edges"]:
        e.setdefault("metadata", {})
        if e.get("Action") and "action" not in e["metadata"]:
            e["metadata"]["action"] = e["Action"]

    return payload


def normalize_batch(data: list[dict[str, Any]] | dict[str, Any]) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return [normalize_decision(item) for item in data]
    return [normalize_decision(data)]
