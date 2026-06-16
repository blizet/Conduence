"""Shared macro correlation graph — seed file, Supermemory, and agentic schema."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Literal

from app.agentic.graph import sanitize_graph
from app.agentic.memory import format_graph_snapshot, load_graph_from_supermemory
from app.agentic.weight import clamp_weight

logger = logging.getLogger(__name__)

NodeType = Literal["event", "asset", "market", "concept"]

_REPO_ROOT = Path(__file__).resolve().parents[3]


def _resolve_path(raw: str) -> Path:
    path = Path(raw)
    return path if path.is_absolute() else _REPO_ROOT / path


def shared_graph_container_tag() -> str:
    return os.getenv("AGENTIC_SHARED_GRAPH_TAG", "cot-macro-graph-v1").strip()


def shared_graph_seed_path() -> Path:
    agentic_cache = _resolve_path("data/agentic/macro_correlation_graph.json")
    if agentic_cache.is_file():
        return agentic_cache
    return _resolve_path(
        os.getenv("AGENTIC_GRAPH_SEED_PATH", "data/correlation/gemini_macro_graph.json")
    )


def agentic_chat_mutations_enabled() -> bool:
    raw = (os.getenv("AGENTIC_GRAPH_CHAT_MUTATIONS") or "false").strip().lower()
    return raw in {"1", "true", "yes", "on"}


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


async def load_shared_agentic_graph(container_tag: str | None = None) -> tuple[dict[str, list], bool]:
    """Load the global agentic graph from Supermemory, falling back to the seed file."""
    tag = (container_tag or shared_graph_container_tag()).strip()
    snapshot_path = _resolve_path("data/agentic/shared_graph_snapshot.txt")
    seeded_locally = snapshot_path.is_file()

    hydrated = await load_graph_from_supermemory(tag)
    if hydrated.get("nodes") and hydrated.get("edges"):
        graph = sanitize_graph(hydrated)
        if graph["nodes"] and graph["edges"]:
            return graph, True

    seed_graph = load_graph_from_seed_file()
    if seed_graph["nodes"] and seed_graph["edges"]:
        if seeded_locally:
            logger.info(
                "Loaded shared graph from local agentic seed (%s nodes, %s edges) — Supermemory seeded",
                len(seed_graph["nodes"]),
                len(seed_graph["edges"]),
            )
            return seed_graph, True
        logger.info(
            "Using local seed graph (%s nodes, %s edges) — run seed_agentic_graph_supermemory.py to publish",
            len(seed_graph["nodes"]),
            len(seed_graph["edges"]),
        )
        return seed_graph, False

    if snapshot_path.is_file():
        snapshot_text = snapshot_path.read_text(encoding="utf-8")
        from app.agentic.memory import graph_from_memories

        cached = graph_from_memories([snapshot_text])
        if cached.get("nodes") and cached.get("edges"):
            logger.info("Loaded shared graph from local Supermemory snapshot cache")
            return sanitize_graph(cached), True

    return {"nodes": [], "edges": []}, False


def graph_snapshot_content(graph: dict[str, list]) -> str:
    return format_graph_snapshot(graph)
