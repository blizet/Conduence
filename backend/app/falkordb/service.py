import asyncio
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

    async def get_graph_snapshot(self, graph_id: str, limit: int = 500) -> dict[str, Any]:
        nodes_result = await self._query(
            graph_id,
            "MATCH (n) WHERE n.node_id IS NOT NULL "
            "RETURN n.node_id AS id, coalesce(n.node_type, toLower(labels(n)[0])) AS type, "
            "coalesce(n.anchor, false) AS anchor, coalesce(n.correlated_peer, false) AS correlated_peer "
            f"LIMIT {limit}",
        )
        edges_result = await self._query(
            graph_id,
            "MATCH (a)-[r]->(b) WHERE a.node_id IS NOT NULL AND b.node_id IS NOT NULL "
            f"RETURN a.node_id AS source, b.node_id AS target, type(r) AS type LIMIT {limit}",
        )

        nodes = []
        for row in parse_falkor_rows(nodes_result):
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
            entry = {
                "id": row_string(row, "id", "n.node_id"),
                "type": node_type,
            }
            if market_role:
                entry["marketRole"] = market_role
            nodes.append(entry)

        edges = [
            {
                "source": row_string(row, "source", "a.node_id"),
                "target": row_string(row, "target", "b.node_id"),
                "type": row_string(row, "type", "type(r)") or "REL",
            }
            for row in parse_falkor_rows(edges_result)
        ]

        return {"graph_id": graph_id, "nodes": nodes, "edges": edges}

    async def list_graphs(self) -> list[str]:
        if not self._client:
            return []

        def run():
            return self._client.list()

        return await asyncio.to_thread(run)
