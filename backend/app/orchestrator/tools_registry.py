"""Universal tool registry — wraps all backend/app/tools endpoints."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from app.tools.clob import get_clob_quote
from app.tools.kalshi import fetch_kalshi, get_kalshi_quote
from app.tools.coingecko import fetch_coingecko
from app.tools.coinmarketcap import fetch_coinmarketcap
from app.tools.cryptonews import fetch_cryptonews
from app.tools.cryptoquant import fetch_cryptoquant
from app.tools.defillama import fetch_defillama
from app.tools.polymarket_gamma import fetch_gamma_markets
from app.tools.polymarket_wallet import fetch_polymarket_wallet
from app.tools.tavily import fetch_tavily
from app.tools.wallet_monitor import fetch_wallet_monitor
from app.tools.x_monitor import fetch_x_monitor

MAX_ENRICHMENT_CALLS = 6

ToolFn = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]

TOOL_CATEGORIES: dict[str, str] = {
    "coingecko": "price",
    "coinmarketcap": "price",
    "polymarketGamma": "markets",
    "polymarketWallet": "markets",
    "cryptonews": "research",
    "tavily": "research",
    "cryptoquant": "onchain",
    "defillama": "macro",
    "clob": "execution",
    "kalshi": "execution",
    "xMonitor": "research",
    "walletMonitor": "markets",
}


async def _invoke_clob(body: dict[str, Any]) -> dict[str, Any]:
    token_id = (body.get("tokenId") or "").strip()
    if not token_id:
        return {"ok": False, "source": "clob", "request": body, "error": "tokenId is required"}
    data = await get_clob_quote(token_id)
    return {"ok": "error" not in data, "source": "clob", "request": body, "data": data, "error": data.get("error")}


async def _invoke_kalshi(body: dict[str, Any]) -> dict[str, Any]:
    return await fetch_kalshi(body)


TOOL_HANDLERS: dict[str, ToolFn] = {
    "coingecko": fetch_coingecko,
    "coinmarketcap": fetch_coinmarketcap,
    "polymarketGamma": fetch_gamma_markets,
    "polymarketWallet": fetch_polymarket_wallet,
    "cryptonews": fetch_cryptonews,
    "tavily": fetch_tavily,
    "cryptoquant": fetch_cryptoquant,
    "defillama": fetch_defillama,
    "clob": _invoke_clob,
    "kalshi": _invoke_kalshi,
    "xMonitor": fetch_x_monitor,
    "walletMonitor": fetch_wallet_monitor,
}


@dataclass
class ToolSpec:
    id: str
    category: str
    label: str
    connected: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "category": self.category,
            "label": self.label,
            "connected": self.connected,
        }


def build_tool_specs(connected: list[str] | None = None) -> list[ToolSpec]:
    connected_set = set(connected or list(TOOL_HANDLERS.keys()))
    specs: list[ToolSpec] = []
    for tool_id in TOOL_HANDLERS:
        specs.append(
            ToolSpec(
                id=tool_id,
                category=TOOL_CATEGORIES.get(tool_id, "tool"),
                label=tool_id,
                connected=tool_id in connected_set,
            )
        )
    return specs


def build_tool_registry_payload(connected: list[str] | None = None) -> dict[str, Any]:
    specs = build_tool_specs(connected)
    connected_ids = [s.id for s in specs if s.connected]
    return {
        "connected": connected_ids,
        "specs": [s.to_dict() for s in specs if s.connected],
        "all_tools": [s.to_dict() for s in specs],
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
        capped = calls[:MAX_ENRICHMENT_CALLS]

        async def _one(call: dict[str, Any]) -> tuple[str, dict[str, Any]]:
            tool_id = call["tool_id"]
            key = call.get("result_key") or tool_id
            result = await self.invoke(tool_id, call.get("params") or {})
            return key, result

        pairs = await asyncio.gather(*[_one(c) for c in capped])
        return dict(pairs)
