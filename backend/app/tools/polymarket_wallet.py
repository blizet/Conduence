"""Polymarket Data API tool — wallet activity (trades + positions).

Ported from cry/tools/polymarket_data.py.
"""

from typing import Any

import httpx

from app.config import TOOL_FETCH_TIMEOUT_MS
from app.tools.endpoints import DATA_BASE


def _normalized(
    *,
    request: dict[str, Any],
    data: Any = None,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "ok": error is None,
        "source": "polymarketWallet",
        "request": request,
        "data": data if error is None else None,
        "error": error,
    }


async def fetch_polymarket_wallet(body: dict[str, Any]) -> dict[str, Any]:
    wallet = (body.get("wallet") or "").strip()
    action = (body.get("action") or "trades").strip() or "trades"
    limit = int(body.get("limit") or 20)

    request = {"wallet": wallet, "action": action, "limit": limit}

    if not wallet:
        return _normalized(request=request, error="wallet address is required (0x…)")
    if action not in {"trades", "positions"}:
        return _normalized(request=request, error="action must be 'trades' or 'positions'")

    timeout = TOOL_FETCH_TIMEOUT_MS / 1000

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                f"{DATA_BASE}/{action}",
                params={"user": wallet, "limit": limit},
            )
            if response.status_code >= 400:
                detail = response.text.strip()[:200] or f"HTTP {response.status_code}"
                return _normalized(
                    request=request,
                    error=f"Polymarket Data request failed ({response.status_code}): {detail}",
                )
            payload = response.json()
    except Exception as exc:
        return _normalized(request=request, error=str(exc))

    rows = payload if isinstance(payload, list) else []

    if action == "positions":
        return _normalized(request=request, data={"wallet": wallet, "positions": rows})

    trades = [
        {
            "title": t.get("title", ""),
            "side": t.get("side", ""),  # BUY | SELL
            "outcome": t.get("outcome", ""),  # Yes | No
            "size": float(t.get("size") or 0),
            "price": float(t.get("price") or 0),
            "usd": float(t.get("size") or 0) * float(t.get("price") or 0),
            "timestamp": t.get("timestamp"),
            "txHash": t.get("transactionHash", ""),
        }
        for t in rows
    ]
    return _normalized(request=request, data={"wallet": wallet, "trades": trades})
