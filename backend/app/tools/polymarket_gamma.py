"""Polymarket Gamma API tool — market discovery by keyword.

Ported from cry/tools/polymarket_gamma.py. Markets are gated and ranked by a
quality scorecard (strategy sect. 3 + 7):

- hard gates: volume24h >= $10K, liquidity >= $10K, bid-ask spread <= 5%
- quality score (0..1):
    0.40 * volume score     sweet spot $50K-$500K daily volume
    0.35 * spread score     <=2% ideal, scaled to 0 at 5%
    0.25 * liquidity score  saturates at $50K
"""

import json
from typing import Any

import httpx

from app.config import TOOL_FETCH_TIMEOUT_MS
from app.tools.access import resolve_access
from app.tools.endpoints import GAMMA

VOLUME_RED_FLAG = 10_000.0
VOLUME_SWEET_LO = 50_000.0
VOLUME_SWEET_HI = 500_000.0
SPREAD_IDEAL = 0.02
SPREAD_MAX = 0.05
LIQUIDITY_MIN = 10_000.0
LIQUIDITY_FULL = 50_000.0


def quality_score(volume_24h: float, spread: float, liquidity: float) -> float:
    """Composite market-quality score in [0, 1]."""
    if volume_24h < VOLUME_SWEET_LO:
        vol = max(0.0, (volume_24h - VOLUME_RED_FLAG) / (VOLUME_SWEET_LO - VOLUME_RED_FLAG)) * 0.8
    elif volume_24h <= VOLUME_SWEET_HI:
        vol = 1.0
    else:
        vol = 0.85  # hyper-liquid: efficient pricing, less mispricing edge

    if spread <= SPREAD_IDEAL:
        spr = 1.0
    elif spread >= SPREAD_MAX:
        spr = 0.0
    else:
        spr = 1.0 - (spread - SPREAD_IDEAL) / (SPREAD_MAX - SPREAD_IDEAL)

    liq = min(1.0, max(0.0, (liquidity - LIQUIDITY_MIN) / (LIQUIDITY_FULL - LIQUIDITY_MIN)))

    return round(0.40 * vol + 0.35 * spr + 0.25 * liq, 3)


def _parse_market(m: dict[str, Any]) -> dict[str, Any] | None:
    question = m.get("question") or ""
    if not question:
        return None
    try:
        prices = m.get("outcomePrices")
        if isinstance(prices, str):
            prices = json.loads(prices)
        outcomes = m.get("outcomes")
        if isinstance(outcomes, str):
            outcomes = json.loads(outcomes)
    except (ValueError, TypeError):
        prices, outcomes = [], []

    best_bid = float(m.get("bestBid") or 0)
    best_ask = float(m.get("bestAsk") or 0)
    spread = round(best_ask - best_bid, 4) if 0 < best_bid < best_ask < 1 else None
    volume = float(m.get("volume24hr") or 0)
    liquidity = float(m.get("liquidity") or 0)

    return {
        "question": question,
        "slug": m.get("slug", ""),
        "conditionId": m.get("conditionId", ""),
        "outcomes": outcomes or [],
        "outcomePrices": [float(p) for p in (prices or [])],
        "volume24hr": volume,
        "liquidity": liquidity,
        "bestBid": best_bid or None,
        "bestAsk": best_ask or None,
        "spread": spread,
        "quality": quality_score(volume, spread if spread is not None else SPREAD_MAX, liquidity),
    }


def _passes_gates(
    m: dict[str, Any], min_volume_24h: float, min_liquidity: float, max_spread: float
) -> bool:
    if m["volume24hr"] < min_volume_24h or m["liquidity"] < min_liquidity:
        return False
    if m["spread"] is not None and m["spread"] > max_spread:
        return False
    return True


def _normalized(
    *,
    request: dict[str, Any],
    data: Any = None,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "ok": error is None,
        "source": "polymarketGamma",
        "request": request,
        "data": data if error is None else None,
        "error": error,
    }


async def fetch_gamma_markets(body: dict[str, Any]) -> dict[str, Any]:
    access_mode, endpoint, access_error = resolve_access(
        "polymarketGamma", body, default_endpoint="markets_search"
    )
    if access_error:
        return _normalized(request={"accessMode": access_mode, "endpoint": endpoint}, error=access_error)

    if endpoint == "events_list":
        return await _fetch_gamma_events(body, access_mode, endpoint)

    if endpoint == "markets_list":
        return await _fetch_gamma_markets_list(body, access_mode, endpoint)

    return await _fetch_gamma_markets_search(body, access_mode, endpoint)


async def _fetch_gamma_events(body: dict[str, Any], access_mode: str, endpoint: str) -> dict[str, Any]:
    limit = int(body.get("limit") or 20)
    request = {"accessMode": access_mode, "endpoint": endpoint, "limit": limit}
    timeout = TOOL_FETCH_TIMEOUT_MS / 1000
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                f"{GAMMA.base}/events",
                params={"closed": "false", "active": "true", "limit": limit},
            )
            if response.status_code >= 400:
                detail = response.text.strip()[:200] or f"HTTP {response.status_code}"
                return _normalized(request=request, error=f"Gamma request failed ({response.status_code}): {detail}")
            payload = response.json()
            return _normalized(request=request, data={"events": payload if isinstance(payload, list) else []})
    except Exception as exc:
        return _normalized(request=request, error=str(exc))


async def _fetch_gamma_markets_list(body: dict[str, Any], access_mode: str, endpoint: str) -> dict[str, Any]:
    limit = int(body.get("limit") or 8)
    request = {"accessMode": access_mode, "endpoint": endpoint, "limit": limit}
    timeout = TOOL_FETCH_TIMEOUT_MS / 1000
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                GAMMA.markets,
                params={
                    "closed": "false",
                    "active": "true",
                    "limit": limit,
                    "order": "volume24hr",
                    "ascending": "false",
                },
            )
            if response.status_code >= 400:
                detail = response.text.strip()[:200] or f"HTTP {response.status_code}"
                return _normalized(request=request, error=f"Gamma request failed ({response.status_code}): {detail}")
            raw = response.json()
    except Exception as exc:
        return _normalized(request=request, error=str(exc))

    markets = [_parse_market(m) for m in raw if isinstance(raw, list)]
    markets = [m for m in markets if m]
    return _normalized(request=request, data={"markets": markets[:limit], "scanned": len(raw) if isinstance(raw, list) else 0})


async def _fetch_gamma_markets_search(body: dict[str, Any], access_mode: str, endpoint: str) -> dict[str, Any]:
    raw_keywords = body.get("keywords") or ""
    if isinstance(raw_keywords, list):
        keywords = [str(k).strip().lower() for k in raw_keywords if str(k).strip()]
    else:
        keywords = [part.strip().lower() for part in str(raw_keywords).split(",") if part.strip()]

    limit = int(body.get("limit") or 8)
    min_volume_24h = float(body.get("minVolume24h") or VOLUME_RED_FLAG)
    min_liquidity = float(body.get("minLiquidity") or LIQUIDITY_MIN)
    max_spread = float(body.get("maxSpread") or SPREAD_MAX)

    request = {
        "accessMode": access_mode,
        "endpoint": endpoint,
        "keywords": keywords,
        "limit": limit,
        "minVolume24h": min_volume_24h,
        "minLiquidity": min_liquidity,
        "maxSpread": max_spread,
    }

    if not keywords:
        return _normalized(request=request, error="keywords is required (comma-separated, e.g. bitcoin,etf)")

    params = {
        "closed": "false",
        "active": "true",
        "limit": 200,
        "order": "volume24hr",
        "ascending": "false",
    }
    timeout = TOOL_FETCH_TIMEOUT_MS / 1000

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(GAMMA.markets, params=params)
            if response.status_code >= 400:
                detail = response.text.strip()[:200] or f"HTTP {response.status_code}"
                return _normalized(
                    request=request,
                    error=f"Gamma request failed ({response.status_code}): {detail}",
                )
            raw = response.json()
    except Exception as exc:
        return _normalized(request=request, error=str(exc))

    if not isinstance(raw, list):
        return _normalized(request=request, error="Unexpected Gamma response shape")

    markets = []
    for m in raw:
        parsed = _parse_market(m)
        if not parsed:
            continue
        q = parsed["question"].lower()
        if any(kw in q for kw in keywords) and _passes_gates(
            parsed, min_volume_24h, min_liquidity, max_spread
        ):
            markets.append(parsed)
    markets.sort(key=lambda m: -m["quality"])

    return _normalized(request=request, data={"markets": markets[:limit], "scanned": len(raw)})
