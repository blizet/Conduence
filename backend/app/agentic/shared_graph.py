"""Shared macro correlation graph — local seed file and agentic schema."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Literal

from app.agentic.graph import sanitize_graph
from app.agentic.memory import load_user_graph_file, save_user_graph_file
from app.agentic.weight import clamp_weight

logger = logging.getLogger(__name__)

NodeType = Literal["event", "asset", "market", "concept"]

_REPO_ROOT = Path(__file__).resolve().parents[3]
SEED_PATH = _REPO_ROOT / "data" / "agentic" / "macro_correlation_graph.json"


def shared_graph_container_tag() -> str:
    return "cot-macro-graph-v1"


def shared_graph_seed_path() -> Path:
    return SEED_PATH


def agentic_chat_mutations_enabled(container_tag: str | None = None) -> bool:
    """User agentic containers allow chat edits; shared template is read-only."""
    if container_tag and container_tag.strip() != shared_graph_container_tag():
        return True
    return False


def user_agentic_container_tag(user_slug: str) -> str:
    slug = user_slug.strip().lower().replace(".", "-")
    return f"{slug}.agentic.v1"


def _correlation_node_type(node_id: str, raw_type: str, sector: str) -> NodeType:
    if raw_type == "asset":
        return "asset"
    if node_id.startswith(("geo_", "reg_")):
        return "event"
    if node_id.startswith(("stk_idx_", "fi_", "cmd_")):
        return "market"
    if node_id.startswith("macro_"):
        return "concept"
    sector_lower = sector.lower()
    if sector_lower.startswith("geopolitics"):
        return "event"
    if "indices" in sector_lower:
        return "market"
    if sector_lower.startswith(("crypto_", "stocks_")):
        return "asset"
    return "concept"


def correlation_json_to_agentic(raw: dict[str, Any]) -> dict[str, list]:
    nodes_out: list[dict[str, Any]] = []
    for node in raw.get("nodes") or []:
        node_id = str(node["id"])
        label = str(node.get("label") or node_id)
        sector = str(node.get("sector") or "")
        raw_type = str(node.get("type") or "theme")
        nodes_out.append(
            {
                "id": node_id,
                "label": label,
                "type": _correlation_node_type(node_id, raw_type, sector),
            }
        )

    label_by_id = {n["id"]: n["label"] for n in nodes_out}
    edges_out: list[dict[str, Any]] = []
    for edge in raw.get("edges") or []:
        source = str(edge["source"])
        target = str(edge["target"])
        weight = clamp_weight(float(edge.get("weight") or 0))
        src_label = label_by_id.get(source, source)
        tgt_label = label_by_id.get(target, target)
        edges_out.append(
            {
                "id": f"{source}_to_{target}",
                "source": source,
                "target": target,
                "label": f"{src_label} → {tgt_label}",
                "weight": weight,
                "expectedSign": 1 if weight >= 0 else -1,
            }
        )

    return sanitize_graph({"nodes": nodes_out, "edges": edges_out})


def load_graph_from_seed_file(path: Path | None = None) -> dict[str, list]:
    seed_path = path or shared_graph_seed_path()
    try:
        raw = json.loads(seed_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        logger.warning("Agentic graph seed not found at %s", seed_path)
        return {"nodes": [], "edges": []}
    except json.JSONDecodeError as exc:
        logger.warning("Invalid agentic graph seed JSON at %s: %s", seed_path, exc)
        return {"nodes": [], "edges": []}

    nodes = raw.get("nodes") or []
    if nodes and isinstance(nodes[0], dict) and nodes[0].get("type") in {
        "event",
        "asset",
        "market",
        "concept",
    }:
        return sanitize_graph({"nodes": nodes, "edges": raw.get("edges") or []})
    return correlation_json_to_agentic(raw)


async def load_user_agentic_graph(user_slug: str) -> tuple[dict[str, list], str, bool]:
    """Load user's saved graph, or macro template as starting point."""
    saved = load_user_graph_file(user_slug)
    if saved:
        return saved, "user", False

    template = load_graph_from_seed_file()
    return template, "seed", True


async def load_shared_agentic_graph(_container_tag: str | None = None) -> tuple[dict[str, list], str]:
    """Load the global agentic graph from the local seed file."""
    seed_graph = load_graph_from_seed_file()
    if seed_graph["nodes"] and seed_graph["edges"]:
        logger.info(
            "Loaded shared agentic graph from seed (%s nodes, %s edges)",
            len(seed_graph["nodes"]),
            len(seed_graph["edges"]),
        )
        return seed_graph, "seed"
    return {"nodes": [], "edges": []}, "seed"


async def persist_user_agentic_graph(user_slug: str, graph: dict[str, Any]) -> None:
    save_user_graph_file(user_slug, graph)


def graph_snapshot_content(graph: dict[str, list]) -> str:
    from app.agentic.memory import format_graph_snapshot

    return format_graph_snapshot(graph)
