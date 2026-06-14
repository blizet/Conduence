"""Kalshi market data + order execution."""

from __future__ import annotations

import base64
import os
import time
from typing import Any

import httpx

from app.config import TOOL_FETCH_TIMEOUT_MS

KALSHI_BASE = os.getenv("KALSHI_API_BASE", "https://api.elections.kalshi.com/trade-api/v2").rstrip("/")
TIMEOUT = TOOL_FETCH_TIMEOUT_MS / 1000


def _normalized(*, source: str, request: dict[str, Any], data: Any = None, error: str | None = None) -> dict[str, Any]:
    return {
        "ok": error is None,
        "source": source,
        "request": request,
        "data": data if error is None else None,
        "error": error,
    }


async def list_kalshi_markets(body: dict[str, Any] | None = None) -> dict[str, Any]:
    """List open Kalshi markets (public, no auth)."""
    body = body or {}
    limit = int(body.get("limit") or 200)
    pages = int(body.get("pages") or 3)
    request = {"action": "list_markets", "limit": limit, "pages": pages}
    markets: list[dict[str, Any]] = []
    cursor: str | None = None
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            for _ in range(max(1, pages)):
                params: dict[str, Any] = {"status": "open", "limit": limit}
                if cursor:
                    params["cursor"] = cursor
                res = await client.get(f"{KALSHI_BASE}/markets", params=params)
                if res.status_code >= 400:
                    return _normalized(
                        source="kalshi",
                        request=request,
                        error=f"Kalshi markets list failed ({res.status_code}): {res.text[:200]}",
                    )
                payload = res.json() if res.content else {}
                batch = payload.get("markets") if isinstance(payload, dict) else []
                if isinstance(batch, list):
                    markets.extend(batch)
                cursor = payload.get("cursor") if isinstance(payload, dict) else None
                if not cursor or not batch:
                    break
    except Exception as exc:
        return _normalized(source="kalshi", request=request, error=str(exc))

    return _normalized(source="kalshi", request=request, data={"markets": markets, "count": len(markets)})


async def fetch_kalshi(body: dict[str, Any]) -> dict[str, Any]:
    """Tool entry — quote by ticker or list markets."""
    if (body.get("action") or "").strip() == "list_markets":
        return await list_kalshi_markets(body)
    ticker = (body.get("ticker") or "").strip()
    if not ticker:
        return _normalized(
            source="kalshi",
            request=body,
            error="ticker is required (or action=list_markets)",
        )
    return await get_kalshi_quote(ticker)


async def get_kalshi_quote(ticker: str) -> dict[str, Any]:
    """Top-of-book quote for one Kalshi market (public, no auth)."""
    request = {"ticker": ticker}
    if not ticker:
        return _normalized(source="kalshi", request=request, error="ticker is required")
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.get(f"{KALSHI_BASE}/markets/{ticker}/orderbook")
            if res.status_code >= 400:
                return _normalized(
                    source="kalshi",
                    request=request,
                    error=f"Kalshi orderbook failed ({res.status_code}): {res.text[:200]}",
                )
            book = (res.json() or {}).get("orderbook") or {}
    except Exception as exc:
        return _normalized(source="kalshi", request=request, error=str(exc))

    yes_levels = book.get("yes") or []
    no_levels = book.get("no") or []
    yes_bid, yes_bid_depth = (yes_levels[-1] if yes_levels else (None, 0))
    best_no = no_levels[-1] if no_levels else None
    yes_ask = 100 - best_no[0] if best_no else None
    ask_depth = best_no[1] if best_no else 0
    spread = (yes_ask - yes_bid) if (yes_ask is not None and yes_bid is not None) else None

    return _normalized(
        source="kalshi",
        request=request,
        data={
            "ticker": ticker,
            "yes_bid": yes_bid,
            "yes_ask": yes_ask,
            "spread": spread,
            "ask_depth": ask_depth,
            "bid_depth": yes_bid_depth,
        },
    )


def _load_private_key(pem: str):
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import serialization

    return serialization.load_pem_private_key(
        pem.encode("utf-8"),
        password=None,
        backend=default_backend(),
    )


def _sign_kalshi_request(private_key_pem: str, timestamp: str, method: str, path: str) -> str:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding

    private_key = _load_private_key(private_key_pem)
    message = f"{timestamp}{method}{path}".encode("utf-8")
    signature = private_key.sign(
        message,
        padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.DIGEST_LENGTH),
        hashes.SHA256(),
    )
    return base64.b64encode(signature).decode("utf-8")


def _kalshi_auth_headers(api_key_id: str, private_key_pem: str, method: str, path: str) -> dict[str, str]:
    timestamp = str(int(time.time() * 1000))
    return {
        "KALSHI-ACCESS-KEY": api_key_id,
        "KALSHI-ACCESS-TIMESTAMP": timestamp,
        "KALSHI-ACCESS-SIGNATURE": _sign_kalshi_request(private_key_pem, timestamp, method, path),
        "Content-Type": "application/json",
    }


async def execute_kalshi_trade(req: dict[str, Any]) -> dict[str, Any]:
    """Place a limit order on Kalshi when trade details + credentials are provided."""
    ticker = (req.get("ticker") or "").strip()
    action = (req.get("action") or "buy").strip().lower()
    side = (req.get("side") or "yes").strip().lower()
    count = int(req.get("count") or req.get("size") or 0)
    price_cents = int(req.get("price") or req.get("yesPrice") or 0)
    api_key_id = (req.get("apiKey") or "").strip()
    private_key_pem = (req.get("apiSecret") or "").strip()

    base_request = {
        "ticker": ticker,
        "action": action,
        "side": side,
        "count": count,
        "price": price_cents,
    }

    if not ticker:
        return {**base_request, "status": "error", "message": "ticker is required"}
    if count <= 0:
        return {**base_request, "status": "error", "message": "count must be positive"}
    if price_cents <= 0 or price_cents >= 100:
        return {**base_request, "status": "error", "message": "price must be 1–99 cents"}
    if action not in ("buy", "sell"):
        return {**base_request, "status": "error", "message": "action must be buy or sell"}
    if side not in ("yes", "no"):
        return {**base_request, "status": "error", "message": "side must be yes or no"}

    if not api_key_id or not private_key_pem:
        return {
            **base_request,
            "status": "dry_run",
            "message": (
                "No Kalshi credentials — order validated but not submitted. "
                "Add API key ID and PEM private key on the Kalshi node."
            ),
        }

    order_body: dict[str, Any] = {
        "ticker": ticker,
        "action": action,
        "side": side,
        "type": "limit",
        "count": count,
    }
    if side == "yes":
        order_body["yes_price"] = price_cents
    else:
        order_body["no_price"] = price_cents

    path = "/trade-api/v2/portfolio/orders"
    url = f"{KALSHI_BASE}/portfolio/orders"

    try:
        headers = _kalshi_auth_headers(api_key_id, private_key_pem, "POST", path)
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.post(url, headers=headers, json=order_body)
            if res.status_code >= 400:
                return {
                    **base_request,
                    "status": "error",
                    "message": f"Kalshi order failed ({res.status_code}): {res.text[:300]}",
                }
            payload = res.json()
    except Exception as exc:
        return {**base_request, "status": "error", "message": str(exc)}

    order = payload.get("order") if isinstance(payload, dict) else None
    order_id = None
    if isinstance(order, dict):
        order_id = order.get("order_id") or order.get("id")
    elif isinstance(payload, dict):
        order_id = payload.get("order_id") or payload.get("id")

    return {
        **base_request,
        "status": "submitted",
        "orderId": str(order_id) if order_id else None,
        "message": f"Order {order_id} submitted" if order_id else "Order submitted",
        "raw": payload,
    }
