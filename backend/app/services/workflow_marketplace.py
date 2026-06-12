"""Workflow marketplace — publish and browse canvas templates."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

_REPO_ROOT = Path(__file__).resolve().parents[3]
MARKETPLACE_FILE = _REPO_ROOT / "data" / "workflows" / "marketplace.json"

SECRET_NODE_FIELDS = frozenset({"apiKey", "apiSecret", "apiPassphrase", "llmApiKey"})


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "workflow"


def _ensure_store() -> None:
    MARKETPLACE_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not MARKETPLACE_FILE.is_file():
        MARKETPLACE_FILE.write_text(json.dumps({"workflows": []}, indent=2), encoding="utf-8")


def _load_store() -> dict[str, Any]:
    _ensure_store()
    try:
        raw = json.loads(MARKETPLACE_FILE.read_text(encoding="utf-8"))
        if isinstance(raw, dict) and isinstance(raw.get("workflows"), list):
            return raw
    except (json.JSONDecodeError, OSError):
        pass
    return {"workflows": []}


def _save_store(store: dict[str, Any]) -> None:
    _ensure_store()
    MARKETPLACE_FILE.write_text(json.dumps(store, indent=2), encoding="utf-8")


def sanitize_canvas(canvas: dict[str, Any]) -> dict[str, Any]:
    nodes: list[dict[str, Any]] = []
    for node in canvas.get("nodes") or []:
        if not isinstance(node, dict):
            continue
        data = dict(node.get("data") or {})
        for key in SECRET_NODE_FIELDS:
            if key in data:
                data[key] = ""
        nodes.append({**node, "data": data})
    edges = [e for e in (canvas.get("edges") or []) if isinstance(e, dict)]
    return {"nodes": nodes, "edges": edges}


def list_workflows() -> list[dict[str, Any]]:
    store = _load_store()
    listings: list[dict[str, Any]] = []
    for entry in store.get("workflows") or []:
        if not isinstance(entry, dict):
            continue
        canvas = entry.get("canvas") or {}
        listings.append(
            {
                "id": entry.get("id"),
                "name": entry.get("name"),
                "description": entry.get("description"),
                "publisher": entry.get("publisher"),
                "publishedAt": entry.get("publishedAt"),
                "updatedAt": entry.get("updatedAt"),
                "nodeCount": len(canvas.get("nodes") or []),
                "edgeCount": len(canvas.get("edges") or []),
            }
        )
    listings.sort(key=lambda w: w.get("updatedAt") or w.get("publishedAt") or "", reverse=True)
    return listings


def get_workflow(workflow_id: str) -> dict[str, Any] | None:
    store = _load_store()
    for entry in store.get("workflows") or []:
        if isinstance(entry, dict) and entry.get("id") == workflow_id:
            return entry
    return None


def publish_workflow(body: dict[str, Any]) -> dict[str, Any]:
    name = (body.get("name") or "").strip()
    if not name:
        return {"ok": False, "error": "name is required"}

    canvas = body.get("canvas")
    if not isinstance(canvas, dict):
        return {"ok": False, "error": "canvas must be a JSON object with nodes and edges"}
    nodes = canvas.get("nodes") or []
    if not nodes:
        return {"ok": False, "error": "canvas must include at least one node"}

    publisher = (body.get("publisher") or "anonymous").strip() or "anonymous"
    description = (body.get("description") or "").strip()
    workflow_id = (body.get("id") or "").strip() or f"{_slugify(name)}.{uuid4().hex[:8]}"
    now = _now_iso()
    sanitized = sanitize_canvas(canvas)

    store = _load_store()
    workflows: list[dict[str, Any]] = list(store.get("workflows") or [])
    existing_idx = next((i for i, w in enumerate(workflows) if w.get("id") == workflow_id), None)

    entry = {
        "id": workflow_id,
        "name": name,
        "description": description,
        "publisher": publisher,
        "publishedAt": workflows[existing_idx]["publishedAt"] if existing_idx is not None else now,
        "updatedAt": now,
        "canvas": sanitized,
    }

    if existing_idx is not None:
        workflows[existing_idx] = entry
    else:
        workflows.append(entry)

    _save_store({"workflows": workflows})
    return {"ok": True, "workflow": {k: v for k, v in entry.items() if k != "canvas"}}


def delete_workflow(workflow_id: str) -> dict[str, Any]:
    store = _load_store()
    workflows = [w for w in (store.get("workflows") or []) if w.get("id") != workflow_id]
    if len(workflows) == len(store.get("workflows") or []):
        return {"ok": False, "error": f"Workflow not found: {workflow_id}"}
    _save_store({"workflows": workflows})
    return {"ok": True, "id": workflow_id}
