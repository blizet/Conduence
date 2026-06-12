"""Polymarket Data API tool — wallet activity (trades + positions).

Ported from cry/tools/polymarket_data.py.
"""

from typing import Any

import httpx

from app.config import TOOL_FETCH_TIMEOUT_MS
from app.tools.access import resolve_access
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
    access_mode, endpoint, access_error = resolve_access(
        "polymarketWallet", body, default_endpoint="wallet_trades"
    )
    wallet = (body.get("wallet") or "").strip()
    limit = int(body.get("limit") or 20)

    action_map = {
        "wallet_trades": "trades",
        "wallet_positions": "positions",
        "wallet_activity": "trades",
    }
    action = action_map.get(endpoint, (body.get("action") or "trades").strip() or "trades")

    request = {
        "accessMode": access_mode,
        "endpoint": endpoint,
        "wallet": wallet,
        "action": action,
        "limit": limit,
    }

    if access_error:
        return _normalized(request=request, error=access_error)
    if not wallet:
        return _normalized(request=request, error="wallet address is required (0x…)")

    timeout = TOOL_FETCH_TIMEOUT_MS / 1000

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            if endpoint == "wallet_activity":
                trades_resp = await client.get(
                    f"{DATA_BASE}/trades", params={"user": wallet, "limit": limit}
                )
                positions_resp = await client.get(
                    f"{DATA_BASE}/positions", params={"user": wallet, "limit": limit}
                )
                if trades_resp.status_code >= 400 or positions_resp.status_code >= 400:
                    detail = trades_resp.text.strip()[:200] or f"HTTP {trades_resp.status_code}"
                    return _normalized(
                        request=request,
                        error=f"Polymarket Data request failed: {detail}",
                    )
                trades_raw = trades_resp.json()
                positions_raw = positions_resp.json()
                return _normalized(
                    request=request,
                    data={
                        "wallet": wallet,
                        "trades": _format_trades(trades_raw if isinstance(trades_raw, list) else []),
                        "positions": positions_raw if isinstance(positions_raw, list) else [],
                    },
                )

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

    return _normalized(request=request, data={"wallet": wallet, "trades": _format_trades(rows)})


def _format_trades(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "title": t.get("title", ""),
            "side": t.get("side", ""),
            "outcome": t.get("outcome", ""),
            "size": float(t.get("size") or 0),
            "price": float(t.get("price") or 0),
            "usd": float(t.get("size") or 0) * float(t.get("price") or 0),
            "timestamp": t.get("timestamp"),
            "txHash": t.get("transactionHash", ""),
        }
        for t in rows
    ]
