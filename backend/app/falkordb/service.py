import asyncio
import json
import logging
from typing import Any

from falkordb import FalkorDB

from app.config import FALKORDB_HOST, FALKORDB_PORT
from app.falkordb.cypher_delta import execute_cypher_delta
from app.falkordb.graph_delta import compute_graph_delta, snapshot_from_rows
from app.falkordb.rows import parse_falkor_rows, row_flag, row_string
from app.lib.normalize import augment_correlated_peer_nodes, escape_cypher, graph_name, normalize_decision
from app.schemas.decision import DecisionEvent

logger = logging.getLogger(__name__)


class FalkorDbService:
    def __init__(self) -> None:
        self._client: FalkorDB | None = None

    async def connect(self) -> None:
        self._client = FalkorDB(host=FALKORDB_HOST, port=FALKORDB_PORT)
        logger.info("Connected to FalkorDB at %s:%s", FALKORDB_HOST, FALKORDB_PORT)

    async def close(self) -> None:
        if self._client and hasattr(self._client, "close"):
            close_fn = self._client.close
            if asyncio.iscoroutinefunction(close_fn):
                await close_fn()
            else:
                close_fn()
        self._client = None

    def _graph(self, graph_id: str):
        if not self._client:
            raise RuntimeError("FalkorDB not connected")
        return self._client.select_graph(graph_name(graph_id))

    async def _query(self, graph_id: str, cypher: str, params: dict[str, Any] | None = None):
        graph = self._graph(graph_id)

        def run():
            if params:
                return graph.query(cypher, params)
            return graph.query(cypher)

        return await asyncio.to_thread(run)

    async def merge_cot_delta(self, raw: DecisionEvent) -> dict[str, Any]:
        data = augment_correlated_peer_nodes(normalize_decision(raw))
        graph_key = graph_name(data.graph_id)
        snapshot_rows = await self.get_graph_snapshot(data.graph_id, 10_000)
        snapshot = snapshot_from_rows(snapshot_rows["nodes"], snapshot_rows["edges"])
        delta = compute_graph_delta(snapshot, data)
        payload = data.model_copy(update={"nodes": delta["nodes"]})

        if not delta["nodes"] and not delta["edgeOps"]:
            return {
                "graph": graph_key,
                "nodes": 0,
                "edges": 0,
                "nodesCreated": 0,
                "edgesCreated": 0,
                "nodesSkipped": delta["stats"]["nodesSkipped"],
                "edgeOpsSkipped": delta["stats"]["edgeOpsSkipped"],
            }

        async def graph_query(cypher: str, params: dict[str, Any] | None = None):
            return await self._query(data.graph_id, cypher, params)

        result = await execute_cypher_delta(
            graph_query,
            payload,
            edge_ops=delta["edgeOps"],
            nodes_skipped=delta["stats"]["nodesSkipped"],
            edge_ops_skipped=delta["stats"]["edgeOpsSkipped"],
        )
        return {"graph": graph_key, **result}

    async def get_graph_snapshot(self, graph_id: str, limit: int = 10_000) -> dict[str, Any]:
        node_limit = max(1, min(int(limit), 10_000))
        edge_limit = max(1, min(int(limit) * 2, 20_000))
        nodes_result = await self._query(
            graph_id,
            "MATCH (n) WHERE n.node_id IS NOT NULL AND n.node_id <> '' "
            "RETURN n.node_id AS id, coalesce(n.node_type, toLower(labels(n)[0])) AS type, "
            "coalesce(n.anchor, false) AS anchor, coalesce(n.correlated_peer, false) AS correlated_peer "
            f"LIMIT {node_limit}",
        )
        edges_result = await self._query(
            graph_id,
            "MATCH (a)-[r]->(b) WHERE a.node_id IS NOT NULL AND a.node_id <> '' "
            "AND b.node_id IS NOT NULL AND b.node_id <> '' "
            f"RETURN a.node_id AS source, b.node_id AS target, type(r) AS type LIMIT {edge_limit}",
        )

        node_map: dict[str, dict[str, Any]] = {}
        for row in parse_falkor_rows(nodes_result):
            node_id = row_string(row, "id", "n.node_id")
            if not node_id:
                continue
            node_type = row_string(row, "type") or "Entity"
            anchor = row_flag(row, "anchor")
            correlated_peer = row_flag(row, "correlated_peer")
            market_role = None
            if node_type == "market":
                if anchor:
                    market_role = "anchor"
                elif correlated_peer:
                    market_role = "correlated_peer"
            elif node_type == "correlated_market":
                market_role = "correlated_peer"
            entry: dict[str, Any] = {
                "id": node_id,
                "type": node_type,
            }
            if market_role:
                entry["marketRole"] = market_role
            node_map[node_id] = entry

        edges = [
            {
                "source": row_string(row, "source", "a.node_id"),
                "target": row_string(row, "target", "b.node_id"),
                "type": row_string(row, "type", "type(r)") or "REL",
            }
            for row in parse_falkor_rows(edges_result)
            if row_string(row, "source", "a.node_id") and row_string(row, "target", "b.node_id")
        ]

        return {"graph_id": graph_id, "nodes": list(node_map.values()), "edges": edges}

    async def _node_type(self, graph_id: str, node_id: str) -> str:
        result = await self._query(
            graph_id,
            "MATCH (n {node_id: $node_id}) "
            "RETURN coalesce(n.node_type, toLower(labels(n)[0])) AS type LIMIT 1",
            {"node_id": node_id},
        )
        rows = parse_falkor_rows(result)
        if not rows:
            return ""
        return row_string(rows[0], "type") or ""

    async def _load_trade_provenance(self, graph_id: str, trade_id: str) -> dict[str, Any] | None:
        result = await self._query(
            graph_id,
            "MATCH (n {node_id: $node_id}) "
            "RETURN coalesce(n.provenance_json, '') AS provenance_json LIMIT 1",
            {"node_id": trade_id},
        )
        rows = parse_falkor_rows(result)
        if not rows:
            return None
        raw = row_string(rows[0], "provenance_json")
        if not raw:
            return None
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None

    async def _load_trade_decision_edge(self, graph_id: str, trade_id: str) -> dict[str, Any] | None:
        result = await self._query(
            graph_id,
            "MATCH (s)-[r]->(t {node_id: $trade_id}) "
            "WHERE type(r) STARTS WITH 'OPEN_' OR type(r) STARTS WITH 'CLOSE_' "
            "RETURN s.node_id AS source, t.node_id AS target, type(r) AS rel_type, "
            "coalesce(r.thesis, '') AS thesis, coalesce(r.conviction, 0) AS conviction, "
            "coalesce(r.reasoning, '') AS reasoning, coalesce(r.decision_id, '') AS decision_id, "
            "coalesce(r.timestamp, '') AS timestamp, coalesce(r.tags, []) AS tags "
            "LIMIT 1",
            {"trade_id": trade_id},
        )
        rows = parse_falkor_rows(result)
        if not rows:
            return None
        row = rows[0]
        rel = row_string(row, "rel_type", "type(r)") or "REL"
        tags = row.get("tags")
        if not isinstance(tags, list):
            tags = []
        return {
            "source": row_string(row, "source"),
            "target": row_string(row, "target"),
            "type": rel,
            "action": _action_from_rel(rel),
            "thesis": row_string(row, "thesis"),
            "conviction": float(row.get("conviction") or 0),
            "reasoning": row_string(row, "reasoning"),
            "decision_id": row_string(row, "decision_id"),
            "timestamp": row_string(row, "timestamp"),
            "tags": tags,
        }

    async def get_node_detail(self, graph_id: str, node_id: str) -> dict[str, Any] | None:
        node_result = await self._query(
            graph_id,
            "MATCH (n {node_id: $node_id}) "
            "RETURN n.node_id AS id, coalesce(n.node_type, toLower(labels(n)[0])) AS type, "
            "coalesce(n.anchor, false) AS anchor, coalesce(n.correlated_peer, false) AS correlated_peer, "
            "coalesce(n.decision_id, '') AS decision_id, coalesce(n.provenance_json, '') AS provenance_json, "
            "coalesce(n.created_at, '') AS created_at, coalesce(n.last_seen_at, '') AS last_seen_at "
            "LIMIT 1",
            {"node_id": node_id},
        )
        rows = parse_falkor_rows(node_result)
        if not rows:
            return None

        row = rows[0]
        node_type = row_string(row, "type") or "Entity"
        anchor = row_flag(row, "anchor")
        correlated_peer = row_flag(row, "correlated_peer")
        market_role = None
        if node_type == "market":
            if anchor:
                market_role = "anchor"
            elif correlated_peer:
                market_role = "correlated_peer"
        elif node_type == "correlated_market":
            market_role = "correlated_peer"

        provenance_raw = row_string(row, "provenance_json")
        provenance: dict[str, Any] | None = None
        if provenance_raw:
            try:
                parsed = json.loads(provenance_raw)
                provenance = parsed if isinstance(parsed, dict) else None
            except json.JSONDecodeError:
                provenance = None

        in_edges_result = await self._query(
            graph_id,
            "MATCH (s)-[r]->(t {node_id: $node_id}) "
            "RETURN s.node_id AS source, t.node_id AS target, type(r) AS rel_type, "
            "coalesce(r.thesis, '') AS thesis, coalesce(r.conviction, 0) AS conviction, "
            "coalesce(r.reasoning, '') AS reasoning, coalesce(r.decision_id, '') AS decision_id, "
            "coalesce(r.timestamp, '') AS timestamp, coalesce(r.tags, []) AS tags "
            "LIMIT 50",
            {"node_id": node_id},
        )
        out_edges_result = await self._query(
            graph_id,
            "MATCH (s {node_id: $node_id})-[r]->(t) "
            "RETURN s.node_id AS source, t.node_id AS target, type(r) AS rel_type, "
            "coalesce(r.thesis, '') AS thesis, coalesce(r.conviction, 0) AS conviction, "
            "coalesce(r.reasoning, '') AS reasoning, coalesce(r.decision_id, '') AS decision_id, "
            "coalesce(r.timestamp, '') AS timestamp, coalesce(r.tags, []) AS tags "
            "LIMIT 50",
            {"node_id": node_id},
        )

        def _edge_entry(edge_row: dict[str, Any]) -> dict[str, Any]:
            rel = row_string(edge_row, "rel_type", "type(r)") or "REL"
            tags = edge_row.get("tags")
            if not isinstance(tags, list):
                tags = []
            return {
                "source": row_string(edge_row, "source"),
                "target": row_string(edge_row, "target"),
                "type": rel,
                "action": _action_from_rel(rel),
                "thesis": row_string(edge_row, "thesis"),
                "conviction": float(edge_row.get("conviction") or 0),
                "reasoning": row_string(edge_row, "reasoning"),
                "decision_id": row_string(edge_row, "decision_id"),
                "timestamp": row_string(edge_row, "timestamp"),
                "tags": tags,
            }

        incoming = [_edge_entry(r) for r in parse_falkor_rows(in_edges_result)]
        outgoing = [_edge_entry(r) for r in parse_falkor_rows(out_edges_result)]

        linked_trade_id: str | None = None
        if node_type == "market":
            linked_trade_id = next(
                (
                    e["target"]
                    for e in outgoing
                    if e["type"].startswith("OPEN_") or e["type"].startswith("CLOSE_")
                ),
                None,
            )
        else:
            for edge in incoming:
                src = edge["source"]
                if await self._node_type(graph_id, src) == "trade":
                    linked_trade_id = src
                    break

        if node_type == "market":
            decision_edge = next(
                (
                    e
                    for e in outgoing
                    if e["type"].startswith("OPEN_") or e["type"].startswith("CLOSE_")
                ),
                None,
            )
        else:
            decision_edge = next(
                (e for e in incoming if e["type"].startswith("OPEN_") or e["type"].startswith("CLOSE_")),
                None,
            )

        if linked_trade_id and not decision_edge:
            decision_edge = await self._load_trade_decision_edge(graph_id, linked_trade_id)

        if not provenance and linked_trade_id:
            provenance = await self._load_trade_provenance(graph_id, linked_trade_id)

        node_entry: dict[str, Any] = {
            "id": row_string(row, "id", "n.node_id"),
            "type": node_type,
            "decision_id": row_string(row, "decision_id") or None,
            "created_at": row_string(row, "created_at") or None,
            "last_seen_at": row_string(row, "last_seen_at") or None,
            "provenance": provenance,
        }
        if market_role:
            node_entry["marketRole"] = market_role

        return {
            "graph_id": graph_id,
            "node": node_entry,
            "decision": _decision_summary(
                node_type, decision_edge, node_entry, provenance, linked_trade_id=linked_trade_id
            ),
            "observability": _observability_summary(provenance),
            "incoming_edges": incoming,
            "outgoing_edges": outgoing,
        }

    async def list_graphs(self) -> list[str]:
        if not self._client:
            return []

        def run():
            return self._client.list_graphs()

        try:
            return await asyncio.to_thread(run)
        except Exception as exc:
            logger.warning("FalkorDB list_graphs failed: %s", exc)
            return []


def _action_from_rel(rel_type: str) -> str | None:
    mapping = {
        "OPEN_YES": "Buy YES",
        "OPEN_NO": "Buy NO",
        "CLOSE_YES": "Close YES",
        "CLOSE_NO": "Close NO",
    }
    return mapping.get(rel_type)


def _decision_summary(
    node_type: str,
    decision_edge: dict[str, Any] | None,
    node: dict[str, Any],
    provenance: dict[str, Any] | None,
    *,
    linked_trade_id: str | None = None,
) -> dict[str, Any] | None:
    if node_type == "trade" and decision_edge:
        return {
            "decision_id": decision_edge.get("decision_id") or node.get("decision_id"),
            "action": decision_edge.get("action"),
            "thesis": decision_edge.get("thesis"),
            "reasoning": decision_edge.get("reasoning"),
            "conviction_level": decision_edge.get("conviction"),
            "tags": decision_edge.get("tags") or [],
            "timestamp": decision_edge.get("timestamp"),
            "market_id": decision_edge.get("source"),
        }
    if node_type == "market" and decision_edge:
        return {
            "decision_id": decision_edge.get("decision_id"),
            "linked_trade_id": decision_edge.get("target"),
            "action": decision_edge.get("action"),
            "thesis": decision_edge.get("thesis"),
            "reasoning": decision_edge.get("reasoning"),
            "conviction_level": decision_edge.get("conviction"),
            "timestamp": decision_edge.get("timestamp"),
        }
    if node_type in ("outcome", "feedback") and decision_edge:
        return {
            "decision_id": decision_edge.get("decision_id") or node.get("decision_id"),
            "linked_trade_id": linked_trade_id or decision_edge.get("target"),
            "action": decision_edge.get("action"),
            "thesis": decision_edge.get("thesis"),
            "reasoning": decision_edge.get("reasoning"),
            "conviction_level": decision_edge.get("conviction"),
            "tags": decision_edge.get("tags") or [],
            "timestamp": decision_edge.get("timestamp"),
            "market_id": decision_edge.get("source"),
        }
    if node_type == "signal":
        return {
            "summary": node.get("label") or node.get("summary"),
            "signal_type": node.get("signal_type"),
            "headline": node.get("headline"),
        }
    if node_type == "belief":
        return {
            "thesis": node.get("thesis") or node.get("label"),
            "conviction_level": node.get("conviction_level"),
            "tags": node.get("tags") or [],
            "agentic_anchors": node.get("agentic_anchors") or [],
        }
    if provenance and node_type in ("trade", "market", "agent", "outcome", "feedback", "signal", "belief"):
        execution = provenance.get("execution") if isinstance(provenance.get("execution"), dict) else None
        if execution:
            return {
                "decision_id": node.get("decision_id"),
                "linked_trade_id": linked_trade_id,
                "summary": "Decision metadata available under observability.",
            }
    return None


def _observability_summary(provenance: dict[str, Any] | None) -> dict[str, Any] | None:
    if not provenance:
        return None
    execution = provenance.get("execution")
    if not isinstance(execution, dict):
        return None
    return execution
