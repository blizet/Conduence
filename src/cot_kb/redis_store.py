from __future__ import annotations

import hashlib
import json
import os
import time
from datetime import datetime
from typing import Any

import redis
from redis.exceptions import ResponseError

from cot_kb.graph_topology import graph_id_to_topic, parse_graph_id, user_node_id_from_slug
from cot_kb.normalize import normalize_decision

INDEX_DECISIONS = "idx:cot_decisions"
INDEX_NODES = "idx:cot_nodes"
INDEX_EDGES = "idx:cot_edges"

PREFIX_DECISION = "cotd:"
PREFIX_NODE = "cotn:"
PREFIX_EDGE = "cote:"


def _redis_url() -> str:
    return os.getenv("REDIS_URL", "redis://localhost:6379/0")


def _parse_ts(iso: str) -> float:
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.timestamp()
    except ValueError:
        return time.time()


def _decode(val: Any) -> Any:
    if isinstance(val, bytes):
        return val.decode("utf-8")
    if isinstance(val, dict):
        return {_decode(k): _decode(v) for k, v in val.items()}
    if isinstance(val, list):
        return [_decode(v) for v in val]
    return val


def _parse_ft_search(result: Any) -> list[dict[str, Any]]:
    """Parse FT.SEARCH response (list or dict depending on client version)."""
    hits: list[dict[str, Any]] = []
    if not result:
        return hits

    result = _decode(result)

    if isinstance(result, dict):
        total = int(result.get("total_results", result.get("total", 0)))
        if total == 0:
            return hits
        for doc in result.get("results", result.get("documents", [])):
            if not isinstance(doc, dict):
                continue
            row: dict[str, Any] = {"key": doc.get("id", doc.get("key", ""))}
            extra = doc.get("extra_attributes") or doc.get("fields") or {}
            if isinstance(extra, dict):
                if "$" in extra and isinstance(extra["$"], str):
                    try:
                        row.update(json.loads(extra["$"]))
                    except json.JSONDecodeError:
                        row["raw"] = extra["$"]
                else:
                    row.update(extra)
            hits.append(row)
        return hits

    if isinstance(result, (list, tuple)):
        if len(result) == 0 or result[0] == 0:
            return hits
        i = 1
        while i < len(result):
            doc_id = result[i]
            fields = result[i + 1]
            row: dict[str, Any] = {"key": doc_id}
            if isinstance(fields, (list, tuple)):
                for j in range(0, len(fields), 2):
                    row[str(fields[j])] = fields[j + 1]
            elif isinstance(fields, dict):
                row.update(fields)
            hits.append(row)
            i += 2
    return hits


def _edge_hash(decision_id: str, source: str, target: str, rel: str) -> str:
    raw = f"{decision_id}|{source}|{target}|{rel}"
    return hashlib.sha1(raw.encode()).hexdigest()[:12]


class RedisGraphStore:
    """Mirror decision graph into Redis Stack (JSON + RediSearch) for RedisInsight."""

    def __init__(self, url: str | None = None) -> None:
        self._client = redis.from_url(url or _redis_url(), decode_responses=True)
        self._json = self._client.json()

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> RedisGraphStore:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def ping(self) -> bool:
        return bool(self._client.ping())

    def ensure_indexes(self) -> None:
        """Create RediSearch indexes (idempotent) for RedisInsight browse/search."""
        self._create_json_index(
            INDEX_DECISIONS,
            prefix=PREFIX_DECISION,
            fields=[
                ("graph_id", "TAG"),
                ("decision_id", "TAG"),
                ("updated_at", "TEXT"),
                ("trade_action", "TAG"),
                ("thesis", "TEXT"),
                ("conviction_level", "NUMERIC"),
            ],
        )
        self._create_json_index(
            INDEX_NODES,
            prefix=PREFIX_NODE,
            fields=[
                ("graph_id", "TAG"),
                ("node_id", "TAG"),
                ("node_type", "TAG"),
                ("label", "TAG"),
            ],
        )
        self._create_json_index(
            INDEX_EDGES,
            prefix=PREFIX_EDGE,
            fields=[
                ("graph_id", "TAG"),
                ("decision_id", "TAG"),
                ("source", "TAG"),
                ("target", "TAG"),
                ("relationship_type", "TAG"),
            ],
        )

    def _create_json_index(self, name: str, *, prefix: str, fields: list[tuple[str, str]]) -> None:
        try:
            self._client.execute_command("FT.INFO", name)
            return
        except ResponseError:
            pass

        args: list[Any] = ["FT.CREATE", name, "ON", "JSON", "PREFIX", 1, prefix, "SCHEMA"]
        for field, field_type in fields:
            args.extend([f"$.{field}", "AS", field, field_type])
        self._client.execute_command(*args)

    def sync_decision(self, payload: dict[str, Any]) -> dict[str, int]:
        data = normalize_decision(payload)
        graph_id = data["graph_id"]
        decision_id = data["decision_id"]
        ts = _parse_ts(data["updated_at"])

        trade_action = None
        thesis = None
        conviction = None
        for edge in data["edges"]:
            if edge.get("Action"):
                trade_action = edge.get("Action")
                meta = edge.get("metadata") or {}
                thesis = meta.get("thesis")
                conviction = meta.get("conviction_level")
                break

        decision_key = f"{PREFIX_DECISION}{graph_id}:{decision_id}"
        decision_doc = {
            "graph_id": graph_id,
            "decision_id": decision_id,
            "updated_at": data["updated_at"],
            "operation": data.get("operation", "assert"),
            "trade_action": trade_action,
            "thesis": thesis,
            "conviction_level": conviction,
            "nodes": data["nodes"],
            "edges": data["edges"],
        }
        self._json.set(decision_key, "$", decision_doc)

        pipe = self._client.pipeline()
        pipe.sadd(f"cot:meta:{graph_id}:decisions", decision_id)
        pipe.zadd(f"cot:meta:{graph_id}:timeline", {decision_id: ts})

        nodes_written = 0
        for node in data["nodes"]:
            node_key = f"{PREFIX_NODE}{graph_id}:{node['node_id']}"
            node_doc = {
                "graph_id": graph_id,
                "node_id": node["node_id"],
                "node_type": node["node_type"],
                "label": node.get("label"),
                "properties": node.get("properties") or {},
                "last_decision_id": decision_id,
                "updated_at": data["updated_at"],
            }
            self._json.set(node_key, "$", node_doc)
            pipe.sadd(f"cot:meta:{graph_id}:nodes", node["node_id"])
            nodes_written += 1

        edges_written = 0
        viz_edges: list[dict[str, Any]] = []
        for edge in data["edges"]:
            targets = [edge["target"]] if edge.get("target") else list(edge.get("targets") or [])
            rel = edge.get("relationship_type") or "CONNECTED_TO"
            for target in targets:
                eh = _edge_hash(decision_id, edge["source"], target, rel)
                edge_key = f"{PREFIX_EDGE}{graph_id}:{eh}"
                edge_doc = {
                    "graph_id": graph_id,
                    "decision_id": decision_id,
                    "source": edge["source"],
                    "target": target,
                    "relationship_type": rel,
                    "metadata": edge.get("metadata") or {},
                    "updated_at": data["updated_at"],
                }
                self._json.set(edge_key, "$", edge_doc)
                pipe.sadd(f"cot:meta:{graph_id}:edges", eh)
                pipe.sadd(f"cot:meta:{graph_id}:adj:out:{edge['source']}", eh)
                pipe.sadd(f"cot:meta:{graph_id}:adj:in:{target}", eh)
                viz_edges.append(
                    {
                        "source": edge["source"],
                        "target": target,
                        "type": rel,
                        "decision_id": decision_id,
                    }
                )
                edges_written += 1

        viz_key = f"cot:meta:{graph_id}:viz:latest"
        viz = {
            "graph_id": graph_id,
            "decision_id": decision_id,
            "updated_at": data["updated_at"],
            "nodes": [{"id": n["node_id"], "type": n["node_type"]} for n in data["nodes"]],
            "edges": viz_edges,
        }
        self._json.set(viz_key, "$", viz)
        pipe.execute()

        meta_key = f"cot:meta:{graph_id}:info"
        self._json.set(
            meta_key,
            "$",
            {
                "graph_id": graph_id,
                "last_updated": data["updated_at"],
                "last_decision_id": decision_id,
                "decision_count": self._client.zcard(f"cot:meta:{graph_id}:timeline"),
                "node_count": self._client.scard(f"cot:meta:{graph_id}:nodes"),
                "kafka_topic": graph_id_to_topic(graph_id),
                "redis_insight_hints": {
                    "browse_decisions": f"{PREFIX_DECISION}{graph_id}:*",
                    "browse_nodes": f"{PREFIX_NODE}{graph_id}:*",
                    "viz_snapshot": viz_key,
                    "timeline": f"cot:meta:{graph_id}:timeline",
                },
            },
        )

        self._update_user_registry(graph_id)

        return {"nodes": nodes_written, "edges": edges_written}

    def _update_user_registry(self, graph_id: str) -> None:
        parsed = parse_graph_id(graph_id)
        if not parsed:
            return
        user_slug, role, _version = parsed
        user_node_id = user_node_id_from_slug(user_slug)
        base = f"cot:registry:{user_node_id}"
        self._client.sadd(f"{base}:agents", role)
        self._client.set(f"{base}:graph:{role}", graph_id)
        self._client.sadd(f"{base}:graphs", graph_id)
        self._client.set(f"{base}:topic:{role}", graph_id_to_topic(graph_id))

    def search(
        self, query: str, graph_id: str | None = None, limit: int = 10
    ) -> list[dict[str, Any]]:
        self.ensure_indexes()
        q = query.strip() or "*"
        if graph_id and "@graph_id" not in q:
            tag = graph_id.replace(".", r"\.")
            q = f"@graph_id:{{{tag}}} {q}"
        try:
            result = self._client.execute_command(
                "FT.SEARCH",
                INDEX_DECISIONS,
                q,
                "LIMIT",
                0,
                limit,
                "RETURN",
                3,
                "decision_id",
                "thesis",
                "trade_action",
            )
        except ResponseError:
            return []

        return _parse_ft_search(result)

    def graph_stats(self, graph_id: str) -> dict[str, Any]:
        return {
            "graph_id": graph_id,
            "decisions": self._client.zcard(f"cot:meta:{graph_id}:timeline"),
            "nodes": self._client.scard(f"cot:meta:{graph_id}:nodes"),
            "edge_keys": self._client.scard(f"cot:meta:{graph_id}:edges"),
        }
