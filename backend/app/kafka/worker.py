import asyncio
import json
import logging

from aiokafka import AIOKafkaConsumer

from app.config import COT_KAFKA_FROM_BEGINNING, KAFKA_BROKERS
from app.falkordb.service import FalkorDbService
from app.lib.event_sourced_config import (
    KAFKA_HEADER_PUBLISHER_ID,
    MAIN_WORKER_GROUP,
    MARKET_SIGNALS_TOPIC,
    WORKER_TARGETS,
)
from app.schemas.decision import DecisionEvent
from app.ws.events import EventsManager

logger = logging.getLogger(__name__)


def _decode_header(headers: list[tuple[str, bytes]] | None, key: str) -> str | None:
    if not headers:
        return None
    for k, v in headers:
        if k == key:
            return v.decode("utf-8")
    return None


class MainWorkerService:
    def __init__(self, falkordb: FalkorDbService, events: EventsManager) -> None:
        self._falkordb = falkordb
        self._events = events
        self._agent_id = WORKER_TARGETS["main"]["agentId"]
        self._consumer: AIOKafkaConsumer | None = None
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._consumer = AIOKafkaConsumer(
            MARKET_SIGNALS_TOPIC,
            bootstrap_servers=KAFKA_BROKERS,
            group_id=MAIN_WORKER_GROUP,
            client_id="cot-main-worker",
            auto_offset_reset="earliest" if COT_KAFKA_FROM_BEGINNING else "latest",
        )
        await self._consumer.start()
        self._task = asyncio.create_task(self._run())
        logger.info(
            "Main worker subscribed to %s (agent=%s, graph=%s, fromBeginning=%s)",
            MARKET_SIGNALS_TOPIC,
            self._agent_id,
            WORKER_TARGETS["main"]["graphId"],
            COT_KAFKA_FROM_BEGINNING,
        )

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        if self._consumer:
            await self._consumer.stop()
            self._consumer = None

    async def _run(self) -> None:
        assert self._consumer is not None
        try:
            async for message in self._consumer:
                if not message.value:
                    continue
                publisher_id = _decode_header(message.headers, KAFKA_HEADER_PUBLISHER_ID)
                if publisher_id != self._agent_id:
                    continue
                try:
                    envelope = json.loads(message.value.decode())
                    payload = DecisionEvent.model_validate(envelope["payload"])
                    result = await self._falkordb.merge_cot_delta(payload)
                    await self._events.broadcast(
                        {
                            "type": "decision.ingested",
                            "decision_id": envelope["decision_id"],
                            "graph_id": envelope["graph_id"],
                            "updated_at": envelope["updated_at"],
                            "falkordb": result,
                            "worker": "main",
                        }
                    )
                    logger.info(
                        "Main worker MERGE %s → %s",
                        envelope["decision_id"],
                        result["graph"],
                    )
                except Exception as exc:
                    logger.error("Main worker failed: %s", exc)
        except asyncio.CancelledError:
            pass
