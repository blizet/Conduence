import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from app.signal_registry import get_signal_producer
from app.kafka.producer import SignalProducerService
from app.ws.events import EventsManager

logger = logging.getLogger(__name__)


class AutonomousAgentStreamService:
    def __init__(
        self,
        producer: SignalProducerService,
        events: EventsManager,
        orchestrator: Any | None = None,
        ingress: Any | None = None,
    ) -> None:
        self._producer = producer
        self._events = events
        self._orchestrator = orchestrator
        self._ingress = ingress
        self._sessions: dict[str, dict[str, Any]] = {}
        self._stop_flags: dict[str, bool] = {}
        self._tasks: dict[str, asyncio.Task] = {}

    async def shutdown(self) -> None:
        for agent_id in list(self._sessions.keys()):
            self._stop_flags[agent_id] = True
        for task in self._tasks.values():
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks.values(), return_exceptions=True)
        self._tasks.clear()

    def status(self, agent_id: str) -> dict[str, Any]:
        defn = get_signal_producer(agent_id)
        if not defn:
            return {"ok": False, "error": f"Unknown signal producer: {agent_id}"}
        session = self._sessions.get(agent_id)
        return {
            "ok": True,
            "agentId": agent_id,
            "category": defn.get("category", "mindagent"),
            "running": session.get("running", False) if session else False,
            "emittedCount": session.get("emittedCount", 0) if session else 0,
            "lastSignal": session.get("lastSignal") if session else None,
            "lastError": session.get("lastError") if session else None,
            "feedTopic": defn["feedTopic"],
            "eventType": defn["eventType"],
        }

    async def start(self, agent_id: str, config: dict[str, Any] | None = None) -> dict[str, Any]:
        config = config or {}
        defn = get_signal_producer(agent_id)
        if not defn:
            return {"ok": False, "error": f"Unknown signal producer: {agent_id}"}

        existing = self._sessions.get(agent_id)
        if existing and existing.get("running"):
            return {"ok": True, "running": True, "feedTopic": defn["feedTopic"]}

        try:
            await defn["validateConfig"](config)
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

        self._stop_flags[agent_id] = False
        self._sessions[agent_id] = {
            "running": True,
            "emittedCount": 0,
            "lastSignal": None,
            "feedTopic": defn["feedTopic"],
            "eventType": defn["eventType"],
        }
        run_config = {**config, "ingress": self._ingress}
        self._tasks[agent_id] = asyncio.create_task(self._run_loop(agent_id, defn, run_config))
        logger.info("Autonomous stream started agent=%s topic=%s", agent_id, defn["feedTopic"])
        return {"ok": True, "running": True, "feedTopic": defn["feedTopic"]}

    def stop(self, agent_id: str) -> dict[str, Any]:
        self._stop_flags[agent_id] = True
        session = self._sessions.get(agent_id)
        if session:
            session["running"] = False
        task = self._tasks.pop(agent_id, None)
        if task:
            task.cancel()
        logger.info("Autonomous stream stop requested agent=%s", agent_id)
        return {"ok": True, "running": False}

    async def _run_loop(self, agent_id: str, defn: dict[str, Any], config: dict[str, Any]) -> None:
        try:
            async for signal in defn["streamSignals"](config):
                if self._stop_flags.get(agent_id):
                    break
                await self._emit(agent_id, defn["feedTopic"], defn["eventType"], signal, config)
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.error("Autonomous stream failed agent=%s: %s", agent_id, exc)
            session = self._sessions.get(agent_id)
            if session:
                session["lastError"] = str(exc)
                session["running"] = False
        finally:
            self._stop_flags[agent_id] = True
            session = self._sessions.get(agent_id)
            if session:
                session["running"] = False

    async def _emit(
        self,
        agent_id: str,
        feed_topic: str,
        event_type: str,
        signal: Any,
        config: dict[str, Any] | None = None,
    ) -> None:
        session = self._sessions.get(agent_id)
        if session:
            session["lastSignal"] = signal
            session["emittedCount"] = session.get("emittedCount", 0) + 1
            session["lastError"] = None

        updated_at = datetime.now(timezone.utc).isoformat()
        envelope = {
            "event_type": event_type,
            "agent_id": agent_id,
            "updated_at": updated_at,
            "payload": signal,
        }

        try:
            await self._producer.publish_agent_feed(envelope, feed_topic)
        except Exception as exc:
            logger.warning("Kafka publish failed agent=%s: %s", agent_id, exc)
            if session:
                session["lastError"] = str(exc)

        await self._events.broadcast(
            {
                "type": "agent.feed",
                "agent_id": agent_id,
                "event_type": event_type,
                "topic": feed_topic,
                "updated_at": updated_at,
                "payload": signal,
            }
        )

        if self._orchestrator is not None:
            try:
                await self._orchestrator.enqueue(
                    {
                        "agent_id": agent_id,
                        "event_type": event_type,
                        "payload": signal,
                    }
                )
            except Exception as exc:
                logger.warning("Orchestrator enqueue failed: %s", exc)

        wc = (config or {}).get("workflow_context")
        if wc and self._ingress:
            from app.subagents.cot_emit import maybe_emit_cot_for_subagent

            await maybe_emit_cot_for_subagent(
                signal if isinstance(signal, dict) else {},
                agent_id=agent_id,
                workflow_context=wc,
                ingress=self._ingress,
            )
