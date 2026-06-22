"""Workflow Go Live — start/stop orchestrator from canvas topology."""

from __future__ import annotations

import logging
from typing import Any

from app.orchestrator.workflow_context import compile_workflow_context

logger = logging.getLogger(__name__)


class WorkflowLiveService:
    def __init__(
        self,
        orchestrator_stream: Any,
    ) -> None:
        self._orchestrator = orchestrator_stream
        self._running = False
        self._workflow_context: dict[str, Any] | None = None

    def status(self) -> dict[str, Any]:
        orch = self._orchestrator.status() if self._orchestrator else {}
        return {
            "ok": True,
            "running": self._running,
            "workflow_id": (self._workflow_context or {}).get("workflow_id"),
            "topology": (self._workflow_context or {}).get("topology"),
            "orchestrator": orch,
            "subagents": {},
            "started_subagents": [],
        }

    async def start(
        self,
        canvas: dict[str, Any],
        config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        config = config or {}
        nodes = canvas.get("nodes") or []
        edges = canvas.get("edges") or []
        if not nodes:
            return {"ok": False, "error": "canvas must include nodes"}

        self._workflow_context = compile_workflow_context(nodes, edges, config=config)
        self._running = True

        topology = self._workflow_context.get("topology") or {}
        if not topology.get("has_orchestrator"):
            return {
                "ok": False,
                "error": "Workflow requires an orchestrator (LLM) node to go live.",
            }

        orch_result = await self._orchestrator.start(canvas, config)
        if not orch_result.get("ok"):
            await self.stop()
            return orch_result

        logger.info(
            "Workflow live started workflow_id=%s orchestrator=%s",
            self._workflow_context.get("workflow_id"),
            topology.get("has_orchestrator"),
        )
        return {
            "ok": True,
            "running": True,
            "started_subagents": [],
            "has_orchestrator": topology.get("has_orchestrator"),
            "workflow_id": self._workflow_context.get("workflow_id"),
        }

    async def stop(self) -> dict[str, Any]:
        self._running = False
        if self._orchestrator:
            self._orchestrator.stop()
        self._workflow_context = None
        logger.info("Workflow live stopped")
        return {"ok": True, "running": False}

    def get_workflow_context(self) -> dict[str, Any] | None:
        return self._workflow_context
