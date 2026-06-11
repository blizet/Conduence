"""Background orchestrator — consumes agent feed events and runs LangGraph."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.orchestrator.runner import normalize_inbound_signal, run_orchestrator
from app.ws.events import EventsManager

logger = logging.getLogger(__name__)


class OrchestratorStreamService:
    def __init__(self, events: EventsManager) -> None:
        self._events = events
        self._running = False
        self._canvas: dict[str, Any] = {"nodes": [], "edges": []}
        self._config: dict[str, Any] = {}
        self._memory: dict[str, Any] = {"recent_signals": [], "diverging_nodes": {}}
        self._last_result: dict[str, Any] | None = None
        self._processed = 0
        self._queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._task: asyncio.Task | None = None

    def get_memory(self) -> dict[str, Any]:
        return self._memory

    def set_memory(self, memory: dict[str, Any]) -> None:
        self._memory = memory

    def status(self) -> dict[str, Any]:
        return {
            "ok": True,
            "running": self._running,
            "processed": self._processed,
            "lastResult": self._last_result,
            "memorySize": len(self._memory.get("recent_signals") or []),
        }

    async def start(self, canvas: dict[str, Any], config: dict[str, Any] | None = None) -> dict[str, Any]:
        self._canvas = canvas or {"nodes": [], "edges": []}
        self._config = config or {}
        self._running = True
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._loop())
        logger.info("Orchestrator stream started")
        return {"ok": True, "running": True}

    def stop(self) -> dict[str, Any]:
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None
        logger.info("Orchestrator stream stopped")
        return {"ok": True, "running": False}

    async def enqueue(self, envelope: dict[str, Any]) -> None:
        if self._running:
            await self._queue.put(envelope)

    async def run_once(
        self,
        signal: dict[str, Any],
        canvas: dict[str, Any] | None = None,
        config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        result = await run_orchestrator(
            signal=normalize_inbound_signal(signal),
            canvas=canvas or self._canvas,
            config={**(self._config), **(config or {})},
            memory=self._memory,
        )
        self._memory = result.get("memory") or self._memory
        self._last_result = result
        return result

    async def _loop(self) -> None:
        try:
            while self._running:
                try:
                    envelope = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue
                try:
                    signal = normalize_inbound_signal(envelope)
                    result = await self.run_once(signal)
                    self._processed += 1
                    await self._events.broadcast(
                        {
                            "type": "orchestrator.result",
                            "processed": self._processed,
                            "result": {
                                "decision": result.get("decision"),
                                "suggestions": result.get("suggestions"),
                                "steps": result.get("steps"),
                            },
                        }
                    )
                except Exception as exc:
                    logger.error("Orchestrator processing failed: %s", exc)
        except asyncio.CancelledError:
            pass
