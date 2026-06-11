"""Universal tool registry — wraps all kalshiSports/app/tools endpoints.

Same shape as backend/app/orchestrator/tools_registry.py.
"""

from __future__ import annotations

import asyncio
from typing import Any, Awaitable, Callable

from app.tools.api_football import fetch_live_fixtures
from app.tools.kalshi import fetch_kalshi_markets, fetch_kalshi_orderbook

ToolFn = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]

TOOL_CATEGORIES: dict[str, str] = {
    "kalshiMarkets": "markets",
    "kalshiOrderbook": "execution",
    "apiFootball": "gamestate",
}

TOOL_HANDLERS: dict[str, ToolFn] = {
    "kalshiMarkets": fetch_kalshi_markets,
    "kalshiOrderbook": fetch_kalshi_orderbook,
    "apiFootball": fetch_live_fixtures,
}


class ToolRegistry:
    def __init__(self, connected: list[str] | None = None):
        self._connected = set(connected or list(TOOL_HANDLERS.keys()))

    def is_connected(self, tool_id: str) -> bool:
        return tool_id in self._connected and tool_id in TOOL_HANDLERS

    def connected_ids(self) -> list[str]:
        return [tid for tid in TOOL_HANDLERS if tid in self._connected]

    async def invoke(self, tool_id: str, params: dict[str, Any]) -> dict[str, Any]:
        handler = TOOL_HANDLERS.get(tool_id)
        if not handler:
            return {"ok": False, "source": tool_id, "request": params, "error": f"Unknown tool: {tool_id}"}
        try:
            return await handler(params)
        except Exception as exc:
            return {"ok": False, "source": tool_id, "request": params, "error": str(exc)}

    async def invoke_parallel(self, calls: list[dict[str, Any]]) -> dict[str, Any]:
        async def _one(call: dict[str, Any]) -> tuple[str, dict[str, Any]]:
            tool_id = call["tool_id"]
            key = call.get("result_key") or tool_id
            result = await self.invoke(tool_id, call.get("params") or {})
            return key, result

        pairs = await asyncio.gather(*[_one(c) for c in calls])
        return dict(pairs)
