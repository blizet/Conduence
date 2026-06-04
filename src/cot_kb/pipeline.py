from __future__ import annotations

from typing import Any

from cot_kb.falkordb_store import FalkorDBStore
from cot_kb.ingest import Neo4jIngestor
from cot_kb.redpanda_store import RedpandaStore
from cot_kb.redis_store import RedisGraphStore


def ingest_decision(
    payload: dict[str, Any],
    *,
    neo4j: Neo4jIngestor | None = None,
    redis_store: RedisGraphStore | None = None,
    falkordb: FalkorDBStore | None = None,
    redpanda: RedpandaStore | None = None,
) -> dict[str, Any]:
    """Ingest one decision into configured backends."""
    result: dict[str, Any] = {"decision_id": payload.get("decision_id")}
    if neo4j:
        result["neo4j"] = neo4j.ingest(payload)
    if redis_store:
        result["redis"] = redis_store.sync_decision(payload)
    if falkordb:
        result["falkordb"] = falkordb.sync_decision(payload)
    if redpanda:
        result["redpanda"] = redpanda.sync_decision(payload)
    return result
