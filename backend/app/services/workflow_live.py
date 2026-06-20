"""Workflow Go Live — start/stop orchestrator + wired subagents together."""

from __future__ import annotations

import logging
from typing import Any

from app.orchestrator.workflow_context import compile_workflow_context

logger = logging.getLogger(__name__)


class WorkflowLiveService:
    def __init__(
        self,
        orchestrator_stream: Any,
        autonomous_streams: Any,
        falkordb: Any | None = None,
    ) -> None:
        self._orchestrator = orchestrator_stream
        self._autonomous = autonomous_streams
        self._falkordb = falkordb
        self._running = False
        self._workflow_context: dict[str, Any] | None = None
        self._started_subagents: list[str] = []

    def status(self) -> dict[str, Any]:
        orch = self._orchestrator.status() if self._orchestrator else {}
        subagent_status = {
            agent_id: self._autonomous.status(agent_id)
            for agent_id in self._started_subagents
        }
        return {
            "ok": True,
            "running": self._running,
            "workflow_id": (self._workflow_context or {}).get("workflow_id"),
            "topology": (self._workflow_context or {}).get("topology"),
            "orchestrator": orch,
            "subagents": subagent_status,
            "started_subagents": list(self._started_subagents),
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
        self._started_subagents = []

        topology = self._workflow_context.get("topology") or {}
        subagent_registry = self._workflow_context.get("subagent_registry") or {}

        for agent_id, entry in subagent_registry.items():
            if not entry.get("execution_tools") and not entry.get("simulate"):
                if agent_id == "newsAgent":
                    return {
                        "ok": False,
                        "error": "News Agent requires cryptonews or tavily wired on the canvas.",
                    }
            sub_config = {
                **entry,
                "workflow_context": self._workflow_context,
            }
            result = await self._autonomous.start(agent_id, sub_config)
            if not result.get("ok"):
                await self.stop()
                return result
            self._started_subagents.append(agent_id)

        if topology.get("has_orchestrator"):
            orch_result = await self._orchestrator.start(canvas, config)
            if not orch_result.get("ok"):
                await self.stop()
                return orch_result

        logger.info(
            "Workflow live started workflow_id=%s subagents=%s orchestrator=%s",
            self._workflow_context.get("workflow_id"),
            self._started_subagents,
            topology.get("has_orchestrator"),
        )
        return {
            "ok": True,
            "running": True,
            "started_subagents": self._started_subagents,
            "has_orchestrator": topology.get("has_orchestrator"),
            "workflow_id": self._workflow_context.get("workflow_id"),
        }

    async def stop(self) -> dict[str, Any]:
        self._running = False
        for agent_id in list(self._started_subagents):
            self._autonomous.stop(agent_id)
        self._started_subagents = []
        if self._orchestrator:
            self._orchestrator.stop()
        self._workflow_context = None
        logger.info("Workflow live stopped")
        return {"ok": True, "running": False}

    def get_workflow_context(self) -> dict[str, Any] | None:
        return self._workflow_context
