from __future__ import annotations

import re
from typing import Any, Literal

AgentRole = Literal["publisher", "seeker"]
TOPIC_PREFIX = "cot.decisions"


def user_slug_from_node_id(node_id: str) -> str:
    m = re.match(r"^User_(.+)$", node_id, re.I)
    if m:
        return f"user_{m.group(1).lower()}"
    return re.sub(r"[^a-z0-9]+", "_", node_id.lower())


def user_node_id_from_slug(slug: str) -> str:
    if slug.startswith("user_"):
        return f"User_{slug[5:]}"
    return slug


def agent_node_id(user_slug: str, role: AgentRole) -> str:
    return f"{user_slug}.{role}"


def graph_id_for(user_slug: str, role: AgentRole, version: str = "v1") -> str:
    return f"{user_slug}.{role}.{version}"


def parse_graph_id(graph_id: str) -> tuple[str, AgentRole, str] | None:
    m = re.match(r"^(.+)\.(publisher|seeker)\.(v\d+)$", graph_id)
    if not m:
        return None
    return m.group(1), m.group(2), m.group(3)  # type: ignore[return-value]


def graph_id_to_topic(graph_id: str) -> str:
    parsed = parse_graph_id(graph_id)
    if not parsed:
        return f"{TOPIC_PREFIX}.{graph_id.replace('.', '_')}"
    user_slug, role, _version = parsed
    return f"{TOPIC_PREFIX}.{user_slug}.{role}"


def discover_topics_from_graph_ids(graph_ids: list[str]) -> list[str]:
    return sorted({graph_id_to_topic(g) for g in graph_ids})
