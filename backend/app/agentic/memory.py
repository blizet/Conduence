"""Supermemory persistence for agentic causal graphs."""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from app.agentic.config import is_supermemory_configured
from app.agentic.graph import infer_node_type, is_valid_node_label, slugify
from app.agentic.weight import clamp_weight

logger = logging.getLogger(__name__)

CAUSAL_GRAPH_ENTITY_CONTEXT = """Weighted causal market/geopolitics graph.
Nodes: events, assets, markets. Edges: directed cause→effect with signed weight in [-1,1].
+weight = direct (0 to 1), -weight = inverse (-1 to 0). Update when user revises a link."""

_client: Any | None = None
_container_context_set: set[str] = set()


def _get_client() -> Any | None:
    global _client
    if not is_supermemory_configured():
        return None
    if _client is None:
        from supermemory import Supermemory

        _client = Supermemory()
    return _client


def format_profile_context(profile: Any) -> str:
    static_lines = "\n".join(getattr(getattr(profile, "profile", None), "static", None) or [])
    dynamic_lines = "\n".join(getattr(getattr(profile, "profile", None), "dynamic", None) or [])
    search_results = getattr(profile, "search_results", None) or getattr(profile, "searchResults", None)
    results = getattr(search_results, "results", None) or []
    memories = "\n".join(
        getattr(r, "memory", "") or ""
        for r in results
        if getattr(r, "memory", None)
    )

    parts: list[str] = []
    if static_lines:
        parts.append(f"Static profile:\n{static_lines}")
    if dynamic_lines:
        parts.append(f"Dynamic profile:\n{dynamic_lines}")
    if memories:
        parts.append(f"Relevant memories:\n{memories}")
    return "\n\n".join(parts)


def _ensure_container_context(container_tag: str) -> None:
    if container_tag in _container_context_set:
        return
    _container_context_set.add(container_tag)


def _upsert_node(nodes: dict[str, dict], label: str) -> str:
    node_id = slugify(label)
    if node_id not in nodes:
        nodes[node_id] = {"id": node_id, "label": label, "type": infer_node_type(label)}
    return node_id


def graph_from_memories(memories: list[str]) -> dict:
    nodes: dict[str, dict] = {}
    edges: dict[str, dict] = {}
    text = "\n".join(memories)

    cot_edge_re = re.compile(
        r"cot_edge\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|(direct|inverse)",
        re.I,
    )
    cot_node_re = re.compile(r"cot_node\|([^|]+)\|([^|]+)\|([^|]+)", re.I)
    assigned_re = re.compile(
        r"edge ['\"]([^'\"]+)['\"] → ['\"]([^'\"]+)['\"][^.\n]*weight ([-+]?\d*\.?\d+)",
        re.I,
    )
    causal_re = re.compile(r"causal link: ['\"]([^'\"]+)['\"] → ['\"]([^'\"]+)['\"]", re.I)

    for match in cot_node_re.finditer(text):
        node_id, label, node_type = match.group(1), match.group(2), match.group(3)
        if node_id in {"id", "sourceId", "targetId"} or label in {"label", "sourceLabel", "targetLabel"}:
            continue
        typ = node_type if node_type in {"event", "asset", "market", "concept"} else infer_node_type(label)
        nodes[node_id] = {"id": node_id, "label": label, "type": typ}

    for match in cot_edge_re.finditer(text):
        source_id, source_label, target_id, target_label, weight_raw, direction = match.groups()
        if weight_raw in {"", "unset", "null", "weight"}:
            weight = None
        else:
            try:
                weight = clamp_weight(float(weight_raw))
            except ValueError:
                continue
        nodes[source_id] = {"id": source_id, "label": source_label, "type": infer_node_type(source_label)}
        nodes[target_id] = {"id": target_id, "label": target_label, "type": infer_node_type(target_label)}
        edge_id = f"{source_id}_to_{target_id}"
        edges[edge_id] = {
            "id": edge_id,
            "source": source_id,
            "target": target_id,
            "label": f"{source_label} → {target_label}",
            "weight": weight,
            "expectedSign": -1 if direction.lower() == "inverse" else 1,
        }

    for match in assigned_re.finditer(text):
        source_label, target_label, weight_raw = match.groups()
        if not is_valid_node_label(source_label) or not is_valid_node_label(target_label):
            continue
        source = _upsert_node(nodes, source_label)
        target = _upsert_node(nodes, target_label)
        weight = clamp_weight(float(weight_raw))
        edge_id = f"{source}_to_{target}"
        edges[edge_id] = {
            "id": edge_id,
            "source": source,
            "target": target,
            "label": f"{source_label} → {target_label}",
            "weight": weight,
            "expectedSign": 1 if weight >= 0 else -1,
        }

    for match in causal_re.finditer(text):
        source_label, target_label = match.groups()
        if not is_valid_node_label(source_label) or not is_valid_node_label(target_label):
            continue
        source = _upsert_node(nodes, source_label)
        target = _upsert_node(nodes, target_label)
        edge_id = f"{source}_to_{target}"
        if edge_id in edges:
            continue
        fall = bool(re.search(r"fall|decrease|down", match.group(0), re.I))
        edges[edge_id] = {
            "id": edge_id,
            "source": source,
            "target": target,
            "label": f"{source_label} → {target_label}",
            "weight": None,
            "expectedSign": -1 if fall else 1,
        }

    return {"nodes": list(nodes.values()), "edges": list(edges.values())}


def _format_cot_edge_line(edge: dict, nodes: dict[str, dict]) -> str:
    src = nodes.get(edge["source"])
    tgt = nodes.get(edge["target"])
    direction = "direct" if (edge.get("weight") or edge.get("expectedSign") or 1) >= 0 else "inverse"
    weight = "unset" if edge.get("weight") is None else str(edge["weight"])
    return (
        f"cot_edge|{edge['source']}|{src['label'] if src else edge['source']}|"
        f"{edge['target']}|{tgt['label'] if tgt else edge['target']}|{weight}|{direction}"
    )


def _format_cot_node_line(node: dict) -> str:
    return f"cot_node|{node['id']}|{node['label']}|{node['type']}"


def format_graph_snapshot(graph: dict) -> str:
    node_map = {n["id"]: n for n in graph["nodes"]}
    lines = [
        "cot_graph_snapshot",
        "Authoritative causal graph state. Lines: cot_node|id|label|type and "
        "cot_edge|sourceId|sourceLabel|targetId|targetLabel|weight|direct|inverse",
        *[_format_cot_node_line(n) for n in graph["nodes"]],
        *[_format_cot_edge_line(e, node_map) for e in graph["edges"]],
    ]
    return "\n".join(lines)


def _absorb_texts(texts: set[str], items: list[Any]) -> None:
    for item in items:
        for key in ("memory", "content", "text"):
            value = getattr(item, key, None) if not isinstance(item, dict) else item.get(key)
            if value:
                texts.add(str(value))


def _collect_graph_memories_sync(container_tag: str) -> list[str]:
    sm = _get_client()
    if not sm:
        return []

    _ensure_container_context(container_tag)
    texts: set[str] = set()
    queries = ["cot_graph_snapshot", "cot_edge cot_node causal graph", "Confirmed causal edges"]

    for query in queries:
        try:
            profile = sm.profile(container_tag=container_tag, q=query, threshold=0)
            search_results = getattr(profile, "search_results", None) or getattr(profile, "searchResults", None)
            results = getattr(search_results, "results", None) or []
            _absorb_texts(texts, results)
            prof = getattr(profile, "profile", None)
            if prof:
                for line in getattr(prof, "static", None) or []:
                    texts.add(line)
                for line in getattr(prof, "dynamic", None) or []:
                    texts.add(line)
        except Exception as exc:
            logger.warning("Supermemory profile load failed: %s", exc)

    try:
        search = sm.search.memories(q="cot_graph_snapshot cot_edge", container_tag=container_tag)
        results = getattr(search, "results", None) or []
        _absorb_texts(texts, results)
    except Exception as exc:
        logger.warning("Supermemory search load failed: %s", exc)

    return list(texts)


async def load_graph_from_supermemory(container_tag: str) -> dict:
    memories = await asyncio.to_thread(_collect_graph_memories_sync, container_tag)
    return graph_from_memories(memories)


def _fetch_supermemory_context_sync(container_tag: str, query: str) -> tuple[str | None, list[str]]:
    sm = _get_client()
    if not sm:
        return None, []
    try:
        _ensure_container_context(container_tag)
        profile = sm.profile(container_tag=container_tag, q=query)
        search_results = getattr(profile, "search_results", None) or getattr(profile, "searchResults", None)
        results = getattr(search_results, "results", None) or []
        memories = [
            str(getattr(r, "memory", "") or "")
            for r in results
            if getattr(r, "memory", None)
        ]
        return format_profile_context(profile), memories
    except Exception as exc:
        logger.warning("Supermemory profile failed: %s", exc)
        return None, []


async def fetch_supermemory_context(container_tag: str, query: str) -> tuple[str | None, list[str]]:
    return await asyncio.to_thread(_fetch_supermemory_context_sync, container_tag, query)


def _persist_to_supermemory_sync(
    container_tag: str,
    last_user_message: str,
    last_assistant_message: str,
    graph: dict,
    *,
    persist_graph_snapshot: bool = True,
) -> None:
    sm = _get_client()
    if not sm:
        return
    try:
        _ensure_container_context(container_tag)
        if persist_graph_snapshot and (graph["nodes"] or graph["edges"]):
            sm.add(
                content=format_graph_snapshot(graph),
                container_tag=container_tag,
                custom_id="cot-graph-snapshot",
                metadata={"type": "cot_graph_snapshot"},
            )

        is_graph_only_turn = last_user_message.startswith("[graph]") or not last_assistant_message.strip()
        if not is_graph_only_turn:
            sm.add(
                content=f"user: {last_user_message}\nassistant: {last_assistant_message}",
                container_tag=container_tag,
            )
    except Exception as exc:
        logger.warning("Supermemory add failed: %s", exc)


async def persist_to_supermemory(
    container_tag: str,
    last_user_message: str,
    last_assistant_message: str,
    graph: dict,
    *,
    persist_graph_snapshot: bool = True,
) -> None:
    await asyncio.to_thread(
        _persist_to_supermemory_sync,
        container_tag,
        last_user_message,
        last_assistant_message,
        graph,
        persist_graph_snapshot=persist_graph_snapshot,
    )
