import asyncio
from typing import Any

import httpx

from app.config import TOOL_FETCH_TIMEOUT_MS
from app.tools.endpoints import CLOB

TIMEOUT = TOOL_FETCH_TIMEOUT_MS / 1000


async def _fetch_json(url: str, method: str = "GET", **kwargs: Any) -> Any:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            if method == "POST":
                res = await client.post(url, **kwargs)
            else:
                res = await client.get(url, **kwargs)
            if res.status_code >= 400:
                return {"error": res.status_code, "statusText": res.reason_phrase}
            return res.json()
    except Exception as exc:
        return {"error": str(exc)}


async def get_clob_quote(token_id: str) -> dict[str, Any]:
    orderbook, last_trade_price, spread, midpoint = await asyncio.gather(
        _fetch_json(CLOB.orderbook(token_id)),
        _fetch_json(CLOB.last_trade_price(token_id)),
        _fetch_json(CLOB.spread(token_id)),
        _fetch_json(CLOB.midpoint(token_id)),
    )
    return {
        "tokenId": token_id,
        "orderbook": orderbook,
        "lastTradePrice": last_trade_price,
        "spread": spread,
        "midpoint": midpoint,
    }


async def execute_clob_trade(req: dict[str, Any]) -> dict[str, Any]:
    token_id = req["tokenId"]
    side = req["side"]
    size = req["size"]
    price = req["price"]
    api_key = req.get("apiKey")
    api_secret = req.get("apiSecret")
    api_passphrase = req.get("apiPassphrase")

    if not api_key or not api_secret or not api_passphrase:
        return {
            "status": "dry_run",
            "message": "No CLOB credentials — order validated but not submitted. Add API key, secret, and passphrase on the CLOB node.",
            "tokenId": token_id,
            "side": side,
            "size": size,
            "price": price,
        }

    body = {
        "tokenID": token_id,
        "side": side,
        "size": str(size),
        "price": str(price),
        "type": "GTC",
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.post(
                CLOB.orders,
                json=body,
                headers={
                    "Content-Type": "application/json",
                    "POLY_API_KEY": api_key,
                    "POLY_PASSPHRASE": api_passphrase,
                },
            )
            if res.status_code >= 400:
                return {
                    "status": "error",
                    "message": str(res.status_code),
                    "tokenId": token_id,
                    "side": side,
                    "size": size,
                    "price": price,
                }
            result = res.json()
    except Exception as exc:
        return {
            "status": "error",
            "message": str(exc),
            "tokenId": token_id,
            "side": side,
            "size": size,
            "price": price,
        }

    order_id = result.get("orderID") if isinstance(result, dict) else None
    return {
        "status": "submitted",
        "orderId": str(order_id) if order_id else None,
        "message": f"Order {order_id} submitted" if order_id else "Order submitted",
        "tokenId": token_id,
        "side": side,
        "size": size,
        "price": price,
    }
