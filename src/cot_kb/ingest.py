from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from neo4j import GraphDatabase

from cot_kb.models import DecisionEvent, decision_event_from_dict
from cot_kb.normalize import normalize_decision

INGEST_CYPHER_PATH = Path(__file__).resolve().parents[2] / "cypher" / "ingest.cypher"


def load_cypher() -> str:
    return INGEST_CYPHER_PATH.read_text(encoding="utf-8")


class Neo4jIngestor:
    def __init__(self, uri: str, user: str, password: str) -> None:
        self._driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self) -> None:
        self._driver.close()

    def __enter__(self) -> Neo4jIngestor:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def ingest(self, payload: dict[str, Any]) -> dict[str, int]:
        normalized = normalize_decision(payload)
        decision_event_from_dict(normalized)
        data = normalized
        query = load_cypher()
        with self._driver.session() as session:
            record = session.run(query, payload=data).single()
        if not record:
            return {"nodes": 0, "edges": 0}
        return {
            "nodes": int(record.get("nodes_merged", 0)),
            "edges": int(record.get("edges_merged", 0)),
        }

    def ingest_file(self, path: Path) -> list[dict[str, int]]:
        raw = json.loads(path.read_text(encoding="utf-8"))
        items = raw if isinstance(raw, list) else [raw]
        return [self.ingest(item) for item in items]
