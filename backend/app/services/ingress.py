from typing import Any

from app.kafka.producer import SignalProducerService
from app.lib.event_sourced_config import WORKER_TARGETS
from app.lib.pipeline_config import PUBLISHER_AGENT_ID
from app.ws.events import EventsManager


def _agent_role_for(publisher_id: str) -> str:
    if publisher_id == WORKER_TARGETS["main"]["agentId"]:
        return "main"
    if publisher_id == WORKER_TARGETS["seeker"]["agentId"]:
        return "seeker"
    return "publisher"


class SignalIngressService:
    def __init__(self, producer: SignalProducerService, events: EventsManager) -> None:
        self._producer = producer
        self._events = events

    async def publish_publisher_cot_delta(
        self,
        raw: Any,
        publisher_id: str = PUBLISHER_AGENT_ID,
    ) -> dict[str, Any]:
        result = await self._producer.publish_cot_delta(
            raw,
            {
                "publisher_id": publisher_id,
                "agent_role": _agent_role_for(publisher_id),
            },
        )
        await self._events.broadcast(
            {
                "type": "cot.produced",
                "decision_id": result["decision_id"],
                "graph_id": result["graph_id"],
                "updated_at": result["updated_at"],
                "topic": result["topic"],
                "stage": "redpanda",
            }
        )
        return result
