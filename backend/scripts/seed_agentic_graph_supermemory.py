#!/usr/bin/env python3
"""Publish the shared macro correlation graph to Supermemory for all users.

Usage:
  cd backend
  python scripts/seed_agentic_graph_supermemory.py

Requires SUPERMEMORY_API_KEY in backend/.env
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow running as script from backend/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import json

import app.config  # noqa: F401 — loads backend/.env via dotenv

from app.agentic.config import is_supermemory_configured
from app.agentic.memory import _get_client, format_graph_snapshot
from app.agentic.shared_graph import (
    _resolve_path,
    correlation_json_to_agentic,
    load_graph_from_seed_file,
    shared_graph_container_tag,
)
import os


def _load_graph_for_seed() -> tuple[dict, Path]:
    """Always convert from the correlation JSON source (not stale agentic cache)."""
    correlation_path = _resolve_path(
        os.getenv("AGENTIC_GRAPH_SEED_PATH", "data/correlation/gemini_macro_graph.json")
    )
    if correlation_path.is_file():
        raw = json.loads(correlation_path.read_text(encoding="utf-8"))
        nodes = raw.get("nodes") or []
        if nodes and nodes[0].get("type") in {"event", "asset", "market", "concept"}:
            return load_graph_from_seed_file(correlation_path), correlation_path
        return correlation_json_to_agentic(raw), correlation_path
    return load_graph_from_seed_file(), correlation_path


def main() -> int:
    if not is_supermemory_configured():
        print("SUPERMEMORY_API_KEY is not set in backend/.env", file=sys.stderr)
        return 1

    graph, seed_path = _load_graph_for_seed()
    if not graph["nodes"]:
        print(f"No graph loaded from {seed_path}", file=sys.stderr)
        return 1

    sm = _get_client()
    if sm is None:
        print("Supermemory client unavailable", file=sys.stderr)
        return 1

    tag = shared_graph_container_tag()
    snapshot = format_graph_snapshot(graph)
    sm.add(
        content=snapshot,
        container_tag=tag,
        custom_id="cot-graph-snapshot",
        metadata={"type": "cot_graph_snapshot", "source": "gemini_macro_seed"},
    )
    cache_path = Path(__file__).resolve().parents[2] / "data" / "agentic" / "shared_graph_snapshot.txt"
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(snapshot, encoding="utf-8")
    agentic_json_path = cache_path.parent / "macro_correlation_graph.json"
    agentic_json_path.write_text(
        json.dumps(
            {
                "graph_metadata": {
                    "source": "gemini_macro",
                    "total_nodes": len(graph["nodes"]),
                    "total_edges": len(graph["edges"]),
                },
                "nodes": graph["nodes"],
                "edges": graph["edges"],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    sm.add(
        content=(
            "Shared macro correlation graph for all CoT users. "
            f"{len(graph['nodes'])} nodes and {len(graph['edges'])} weighted causal edges. "
            "Authoritative snapshot id: cot-graph-snapshot."
        ),
        container_tag=tag,
        custom_id="cot-macro-graph-meta",
        metadata={"type": "cot_graph_meta"},
    )

    print(
        f"Seeded Supermemory container '{tag}' with "
        f"{len(graph['nodes'])} nodes and {len(graph['edges'])} edges."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
