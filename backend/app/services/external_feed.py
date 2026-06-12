"""Ingest signals from external (wrapper) mind agents — Kafka + WebSocket fan-out."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.external_agents.registry import get_external_agent
from app.kafka.producer import SignalProducerService
from app.ws.events import EventsManager

logger = logging.getLogger(__name__)


class ExternalFeedService:
    def __init__(
        self,
        producer: SignalProducerService,
        events: EventsManager,
        orchestrator: Any | None = None,
    ) -> None:
        self._producer = producer
        self._events = events
        self._orchestrator = orchestrator
        self._sessions: dict[str, dict[str, Any]] = {}

    def _session(self, agent_id: str) -> dict[str, Any]:
        if agent_id not in self._sessions:
            self._sessions[agent_id] = {
                "emittedCount": 0,
                "lastSignal": None,
                "lastSeen": None,
                "lastError": None,
            }
        return self._sessions[agent_id]

    def _is_live(self, agent_id: str, defn: dict[str, Any]) -> bool:
        session = self._sessions.get(agent_id)
        if not session or not session.get("lastSeen"):
            return False
        try:
            last = datetime.fromisoformat(session["lastSeen"].replace("Z", "+00:00"))
            age = (datetime.now(timezone.utc) - last).total_seconds()
            return age <= float(defn.get("staleAfterSeconds", 45))
        except Exception:
            return False

    def status(self, agent_id: str) -> dict[str, Any]:
        defn = get_external_agent(agent_id)
        if not defn:
            return {"ok": False, "error": f"Unknown external agent: {agent_id}"}

        session = self._session(agent_id)
        live = self._is_live(agent_id, defn)
        return {
            "ok": True,
            "agentId": agent_id,
            "category": "mindagent",
            "source": "external",
            "hosted": False,
            "live": live,
            "running": live,
            "emittedCount": session.get("emittedCount", 0),
            "lastSignal": session.get("lastSignal"),
            "lastSeen": session.get("lastSeen"),
            "lastError": session.get("lastError"),
            "feedTopic": defn["feedTopic"],
            "eventType": defn["eventType"],
            "staleAfterSeconds": defn.get("staleAfterSeconds", 45),
        }

    async def ingest_signal(self, agent_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        defn = get_external_agent(agent_id)
        if not defn:
            return {"ok": False, "error": f"Unknown external agent: {agent_id}"}
        if not isinstance(payload, dict):
            return {"ok": False, "error": "payload must be a JSON object"}

        signal = dict(payload)
        signal.setdefault("agent", agent_id.split(".")[0])
        signal.setdefault("ts", datetime.now(timezone.utc).isoformat())

        return await self._emit(agent_id, defn, signal)

    async def heartbeat(self, agent_id: str) -> dict[str, Any]:
        defn = get_external_agent(agent_id)
        if not defn:
            return {"ok": False, "error": f"Unknown external agent: {agent_id}"}

        now = datetime.now(timezone.utc).isoformat()
        session = self._session(agent_id)
        session["lastSeen"] = now
        session["lastError"] = None
        return {"ok": True, "agentId": agent_id, "lastSeen": now, "live": True}

    async def _emit(self, agent_id: str, defn: dict[str, Any], signal: dict[str, Any]) -> dict[str, Any]:
        session = self._session(agent_id)
        now = datetime.now(timezone.utc).isoformat()
        session["lastSignal"] = signal
        session["emittedCount"] = session.get("emittedCount", 0) + 1
        session["lastSeen"] = now
        session["lastError"] = None

        envelope = {
            "event_type": defn["eventType"],
            "agent_id": agent_id,
            "updated_at": now,
            "payload": signal,
        }

        try:
            await self._producer.publish_agent_feed(envelope, defn["feedTopic"])
        except Exception as exc:
            logger.warning("Kafka publish failed external agent=%s: %s", agent_id, exc)
            session["lastError"] = str(exc)
            return {"ok": False, "error": str(exc)}

        await self._events.broadcast(
            {
                "type": "agent.feed",
                "agent_id": agent_id,
                "event_type": defn["eventType"],
                "topic": defn["feedTopic"],
                "updated_at": now,
                "payload": signal,
            }
        )

        if self._orchestrator is not None:
            try:
                await self._orchestrator.enqueue(
                    {
                        "agent_id": agent_id,
                        "event_type": defn["eventType"],
                        "payload": signal,
                    }
                )
            except Exception as exc:
                logger.warning("Orchestrator enqueue failed external agent=%s: %s", agent_id, exc)

        return {
            "ok": True,
            "agentId": agent_id,
            "feedTopic": defn["feedTopic"],
            "emittedCount": session["emittedCount"],
        }
