import json
import logging
from typing import Any

from aiokafka import AIOKafkaProducer

from app.config import KAFKA_BROKERS
from app.lib.event_sourced_config import (
    EVENT_TYPE_COT_DELTA,
    KAFKA_HEADER_AGENT_ROLE,
    KAFKA_HEADER_PUBLISHER_ID,
    KAFKA_HEADER_SEEKER_ID,
    MARKET_SIGNALS_TOPIC,
)
from app.lib.normalize import normalize_decision
from app.schemas.decision import DecisionEvent

logger = logging.getLogger(__name__)


class SignalProducerService:
    def __init__(self) -> None:
        self._producer: AIOKafkaProducer | None = None

    async def start(self) -> None:
        self._producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BROKERS,
            client_id="cot-signal-producer",
        )
        await self._producer.start()
        logger.info("Signal producer ready → %s", MARKET_SIGNALS_TOPIC)

    async def stop(self) -> None:
        if self._producer:
            await self._producer.stop()
            self._producer = None

    async def publish_cot_delta(
        self,
        raw: Any,
        headers: dict[str, str | None],
    ) -> dict[str, Any]:
        if not self._producer:
            raise RuntimeError("Kafka producer not started")

        if isinstance(raw, DecisionEvent):
            event = normalize_decision(raw)
        else:
            event = normalize_decision(DecisionEvent.model_validate(raw))

        envelope = {
            "event_type": EVENT_TYPE_COT_DELTA,
            "graph_id": event.graph_id,
            "decision_id": event.decision_id,
            "updated_at": event.updated_at,
            "payload": event.model_dump(),
        }

        kafka_headers: list[tuple[str, bytes]] = []
        if headers.get("publisher_id"):
            kafka_headers.append((KAFKA_HEADER_PUBLISHER_ID, headers["publisher_id"].encode()))
        if headers.get("seeker_id"):
            kafka_headers.append((KAFKA_HEADER_SEEKER_ID, headers["seeker_id"].encode()))
        if headers.get("agent_role"):
            kafka_headers.append((KAFKA_HEADER_AGENT_ROLE, headers["agent_role"].encode()))

        await self._producer.send_and_wait(
            MARKET_SIGNALS_TOPIC,
            value=json.dumps(envelope).encode(),
            key=envelope["graph_id"].encode(),
            headers=kafka_headers,
        )
        logger.info(
            "Produced %s → %s key=%s",
            envelope["decision_id"],
            MARKET_SIGNALS_TOPIC,
            envelope["graph_id"],
        )
        return {**envelope, "topic": MARKET_SIGNALS_TOPIC}

    async def publish_agent_feed(self, envelope: dict[str, Any], topic: str) -> dict[str, Any]:
        if not self._producer:
            raise RuntimeError("Kafka producer not started")

        await self._producer.send_and_wait(
            topic,
            value=json.dumps(envelope).encode(),
            key=envelope["agent_id"].encode(),
            headers=[
                ("agent_id", envelope["agent_id"].encode()),
                ("event_type", envelope["event_type"].encode()),
            ],
        )
        logger.info(
            "Produced %s → %s agent=%s",
            envelope["event_type"],
            topic,
            envelope["agent_id"],
        )
        return {**envelope, "topic": topic}
