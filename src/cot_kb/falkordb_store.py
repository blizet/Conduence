from __future__ import annotations

import json
import os
import re
from typing import Any

import redis

from cot_kb.normalize import LABEL_MAP, normalize_decision


def _falkor_url() -> str:
    return os.getenv("FALKORDB_URL", "redis://localhost:6380/0")


def _graph_name(graph_id: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_]", "_", graph_id)


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


class FalkorDBStore:
    """Mirror decision graph into FalkorDB (openCypher) for FalkorDB Browser."""

    def __init__(self, url: str | None = None) -> None:
        self._client = redis.from_url(url or _falkor_url(), decode_responses=True)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> FalkorDBStore:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def ping(self) -> bool:
        return bool(self._client.ping())

    def _query(self, graph: str, cypher: str) -> Any:
        return self._client.execute_command("GRAPH.QUERY", graph, cypher, "--compact")

    def sync_decision(self, payload: dict[str, Any]) -> dict[str, int]:
        data = normalize_decision(payload)
        graph = _graph_name(data["graph_id"])
        decision_id = _escape(data["decision_id"])
        updated_at = _escape(data["updated_at"])
        operation = _escape(data.get("operation", "assert"))

        self._query(
            graph,
            f"MERGE (d:Decision {{decision_id: '{decision_id}'}}) "
            f"SET d.updated_at = '{updated_at}', d.operation = '{operation}', "
            f"d.graph_id = '{_escape(data['graph_id'])}'",
        )

        nodes_written = 0
        for node in data["nodes"]:
            label = node.get("label") or LABEL_MAP.get(node["node_type"], "Entity")
            nid = _escape(node["node_id"])
            ntype = _escape(node["node_type"])
            self._query(
                graph,
                f"MERGE (n:{label} {{node_id: '{nid}'}}) "
                f"SET n.node_type = '{ntype}', n.updated_at = '{updated_at}'",
            )
            self._query(
                graph,
                f"MATCH (d:Decision {{decision_id: '{decision_id}'}}), (n {{node_id: '{nid}'}}) "
                f"MERGE (d)-[:TOUCHES]->(n)",
            )
            nodes_written += 1

        edges_written = 0
        for edge in data["edges"]:
            targets = [edge["target"]] if edge.get("target") else list(edge.get("targets") or [])
            rel = edge.get("relationship_type") or "CONNECTED_TO"
            rel_safe = re.sub(r"[^A-Z0-9_]", "_", rel.upper())
            meta = json.dumps(edge.get("metadata") or {})
            meta_esc = _escape(meta)
            action = edge.get("Action")
            action_set = f", r.action = '{_escape(action)}'" if action else ""

            for target in targets:
                src = _escape(edge["source"])
                tgt = _escape(target)
                self._query(
                    graph,
                    f"MATCH (s {{node_id: '{src}'}}), (t {{node_id: '{tgt}'}}) "
                    f"MERGE (s)-[r:{rel_safe} {{decision_id: '{decision_id}'}}]->(t) "
                    f"SET r.metadata_json = '{meta_esc}'{action_set}, "
                    f"r.updated_at = '{updated_at}'",
                )
                edges_written += 1

        return {"nodes": nodes_written, "edges": edges_written, "graph": graph}

    def list_graphs(self) -> list[str]:
        raw = self._client.execute_command("GRAPH.LIST")
        if isinstance(raw, list):
            return [str(g) for g in raw]
        return []

    def flush_all(self) -> None:
        for graph in self.list_graphs():
            self._client.execute_command("GRAPH.DELETE", graph)
