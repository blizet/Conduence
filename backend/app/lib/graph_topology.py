import re
from typing import Literal, Optional

from app.schemas.decision import DecisionEvent

AgentRole = Literal["publisher", "seeker", "main"]


def user_slug_from_node_id(node_id: str) -> str:
    m = re.match(r"^User_(.+)$", node_id, re.I)
    if m:
        return f"user_{m.group(1).lower()}"
    return re.sub(r"[^a-z0-9]+", "_", node_id.lower())


def user_node_id_from_slug(slug: str) -> str:
    if re.match(r"^user_[a-z0-9_]+$", slug, re.I) and slug == slug.lower():
        return slug
    if slug.startswith("user_"):
        return f"User_{slug[5:]}"
    return slug


def agent_node_id(user_slug: str, role: AgentRole) -> str:
    return f"{user_slug}.{role}"


def graph_id_for(user_slug: str, role: AgentRole, version: str = "v1") -> str:
    return f"{user_slug}.{role}.{version}"


def parse_graph_id(graph_id: str) -> Optional[dict[str, str]]:
    m = re.match(r"^(.+)\.(publisher|seeker|main)\.(v\d+)$", graph_id)
    if not m:
        return None
    return {"userSlug": m.group(1), "role": m.group(2), "version": m.group(3)}


def primary_user_node_id(nodes: list) -> Optional[str]:
    for n in nodes:
        if n.node_type == "user":
            return n.node_id
    return None


def resolve_agent_context(event: DecisionEvent) -> Optional[dict]:
    parsed = parse_graph_id(event.graph_id)
    if parsed:
        return {
            "userSlug": parsed["userSlug"],
            "role": parsed["role"],
            "agentId": agent_node_id(parsed["userSlug"], parsed["role"]),
            "userNodeId": user_node_id_from_slug(parsed["userSlug"]),
        }
    user_node_id = primary_user_node_id(event.nodes)
    if not user_node_id:
        return None
    user_slug = user_slug_from_node_id(user_node_id)
    return {
        "userSlug": user_slug,
        "role": "publisher",
        "agentId": agent_node_id(user_slug, "publisher"),
        "userNodeId": user_node_id,
    }
