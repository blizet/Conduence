from __future__ import annotations

import json
import os
from typing import Any

from cot_kb.graph_topology import graph_id_to_topic
from cot_kb.normalize import normalize_decision

DEFAULT_TOPIC = "cot.decisions"


def _kafka_bootstrap() -> str:
    return os.getenv("KAFKA_BOOTSTRAP", "localhost:19092")


class RedpandaStore:
    """Publish decision events to Redpanda (Kafka API) for Redpanda Console."""

    def __init__(
        self,
        bootstrap: str | None = None,
        topic: str | None = None,
    ) -> None:
        self._bootstrap = bootstrap or _kafka_bootstrap()
        self._topic = topic or os.getenv("REDPANDA_TOPIC", DEFAULT_TOPIC)
        self._producer = None

    def _ensure_producer(self):
        if self._producer is not None:
            return self._producer
        try:
            from kafka import KafkaProducer
        except ImportError as exc:
            raise RuntimeError("Install kafka-python: pip install kafka-python") from exc

        self._producer = KafkaProducer(
            bootstrap_servers=[self._bootstrap],
            value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
            acks="all",
        )
        return self._producer

    def close(self) -> None:
        if self._producer:
            self._producer.flush()
            self._producer.close()
            self._producer = None

    def __enter__(self) -> RedpandaStore:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def ping(self) -> bool:
        producer = self._ensure_producer()
        return producer.bootstrap_connected()

    def ensure_topic(self) -> None:
        """Create topic via rpk-style admin if missing (best-effort via producer)."""
        producer = self._ensure_producer()
        producer.send(self._topic, value={"event": "cot.topic.bootstrap"})
        producer.flush()

    def sync_decision(self, payload: dict[str, Any]) -> dict[str, str]:
        data = normalize_decision(payload)
        topic = graph_id_to_topic(data["graph_id"])
        producer = self._ensure_producer()
        key = data["graph_id"]
        envelope = {
            "event_type": "decision.ingested",
            "graph_id": data["graph_id"],
            "decision_id": data["decision_id"],
            "updated_at": data["updated_at"],
            "payload": data,
        }
        future = producer.send(topic, key=key, value=envelope)
        meta = future.get(timeout=10)
        return {
            "topic": topic,
            "partition": str(meta.partition),
            "offset": str(meta.offset),
        }

    @property
    def topic(self) -> str:
        return self._topic
