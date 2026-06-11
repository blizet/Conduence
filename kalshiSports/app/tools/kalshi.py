"""Kalshi public market-data tools (no auth needed for read-only).

Same contract as backend/app/tools: async fetch_*(body) -> normalized dict.
"""

from __future__ import annotations

import os
from typing import Any

import httpx

KALSHI_BASE = os.getenv("KALSHI_API_BASE", "https://api.elections.kalshi.com/trade-api/v2")
TIMEOUT_S = float(os.getenv("KALSHI_TIMEOUT_S", "10"))


def _normalized(*, source: str, request: dict[str, Any], data: Any = None, error: str | None = None) -> dict[str, Any]:
    return {
        "ok": error is None,
        "source": source,
        "request": request,
        "data": data if error is None else None,
        "error": error,
    }


async def fetch_kalshi_markets(body: dict[str, Any]) -> dict[str, Any]:
    """List open markets, optionally filtered by series_ticker.

    body: { "series_ticker"?: str, "limit"?: int, "status"?: str }
    """
    request = {
        "series_ticker": body.get("series_ticker"),
        "status": body.get("status", "open"),
        "limit": int(body.get("limit", 100)),
    }
    params = {k: v for k, v in request.items() if v}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            res = await client.get(f"{KALSHI_BASE}/markets", params=params)
            if res.status_code >= 400:
                return _normalized(source="kalshiMarkets", request=request,
                                   error=f"Kalshi markets failed ({res.status_code}): {res.text[:200]}")
            payload = res.json()
    except Exception as exc:
        return _normalized(source="kalshiMarkets", request=request, error=str(exc))

    markets = []
    for m in payload.get("markets", []):
        markets.append(
            {
                "ticker": m.get("ticker"),
                "event_ticker": m.get("event_ticker"),
                "title": m.get("title", ""),
                "yes_sub_title": m.get("yes_sub_title", ""),
                "status": m.get("status"),
                "result": m.get("result", ""),
                "close_time": m.get("close_time"),
                "yes_bid": m.get("yes_bid"),
                "yes_ask": m.get("yes_ask"),
                "volume": m.get("volume", 0),
                "liquidity": m.get("liquidity", 0),
            }
        )
    return _normalized(source="kalshiMarkets", request=request, data={"markets": markets})


async def fetch_kalshi_orderbook(body: dict[str, Any]) -> dict[str, Any]:
    """Top-of-book for one market.

    body: { "ticker": str }
    Kalshi orderbook lists resting YES bids and NO bids (cents).
    yes_ask = 100 - best NO bid; depth at ask = size of that NO level.
    """
    ticker = (body.get("ticker") or "").strip()
    request = {"ticker": ticker}
    if not ticker:
        return _normalized(source="kalshiOrderbook", request=request, error="ticker is required")
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            res = await client.get(f"{KALSHI_BASE}/markets/{ticker}/orderbook")
            if res.status_code >= 400:
                return _normalized(source="kalshiOrderbook", request=request,
                                   error=f"Kalshi orderbook failed ({res.status_code}): {res.text[:200]}")
            book = (res.json() or {}).get("orderbook") or {}
    except Exception as exc:
        return _normalized(source="kalshiOrderbook", request=request, error=str(exc))

    yes_levels = book.get("yes") or []  # [[price_cents, count], ...] bids for YES
    no_levels = book.get("no") or []    # [[price_cents, count], ...] bids for NO

    yes_bid, yes_bid_depth = (yes_levels[-1] if yes_levels else (None, 0))
    best_no = no_levels[-1] if no_levels else None
    yes_ask = 100 - best_no[0] if best_no else None
    ask_depth = best_no[1] if best_no else 0
    spread = (yes_ask - yes_bid) if (yes_ask is not None and yes_bid is not None) else None

    return _normalized(
        source="kalshiOrderbook",
        request=request,
        data={
            "yes_bid": yes_bid,
            "yes_ask": yes_ask,
            "spread": spread,
            "ask_depth": ask_depth,
            "bid_depth": yes_bid_depth,
        },
    )
