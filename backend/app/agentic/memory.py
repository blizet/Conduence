"""Local persistence for agentic causal graphs."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from app.agentic.graph import sanitize_graph

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[3]
_USER_GRAPHS_DIR = _REPO_ROOT / "data" / "agentic" / "users"


def _user_graph_path(user_slug: str) -> Path:
    slug = user_slug.strip().lower().replace(".", "-")
    return _USER_GRAPHS_DIR / f"{slug}.json"


def load_user_graph_file(user_slug: str) -> dict[str, list] | None:
    path = _user_graph_path(user_slug)
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        graph = sanitize_graph({"nodes": raw.get("nodes") or [], "edges": raw.get("edges") or []})
        if graph["nodes"]:
            return graph
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to load user agentic graph %s: %s", path, exc)
    return None


def save_user_graph_file(user_slug: str, graph: dict[str, Any]) -> None:
    _USER_GRAPHS_DIR.mkdir(parents=True, exist_ok=True)
    path = _user_graph_path(user_slug)
    payload = sanitize_graph(graph)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def format_graph_snapshot(graph: dict) -> str:
    node_map = {n["id"]: n for n in graph["nodes"]}
    lines = [
        "cot_graph_snapshot",
        *[
            f"cot_node|{n['id']}|{n['label']}|{n['type']}"
            for n in graph["nodes"]
        ],
        *[
            f"cot_edge|{e['source']}|{node_map.get(e['source'], {}).get('label', e['source'])}|"
            f"{e['target']}|{node_map.get(e['target'], {}).get('label', e['target'])}|"
            f"{'unset' if e.get('weight') is None else e['weight']}|"
            f"{'direct' if (e.get('weight') or e.get('expectedSign') or 1) >= 0 else 'inverse'}"
            for e in graph["edges"]
        ],
    ]
    return "\n".join(lines)
