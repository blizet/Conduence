"""Wallet monitor — track prediction-market wallet activity with category + suppress filters."""

from __future__ import annotations

import re
from typing import Any, Literal

import httpx

from app.config import TOOL_FETCH_TIMEOUT_MS
from app.tools.access import resolve_access
from app.tools.endpoints import DATA_BASE
from app.tools.kalshi import KALSHI_BASE, _kalshi_auth_headers

Platform = Literal["polymarket", "kalshi"]

CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "geopolitics": [
        "geopolit",
        "ukraine",
        "russia",
        "china",
        "taiwan",
        "nato",
        "war",
        "israel",
        "gaza",
        "iran",
        "ceasefire",
        "invasion",
        "sanction",
    ],
    "crypto": [
        "bitcoin",
        "btc",
        "ethereum",
        "eth",
        "crypto",
        "solana",
        "defi",
        "token",
        "blockchain",
    ],
    "finance": [
        "fed",
        "rate",
        "inflation",
        "gdp",
        "recession",
        "stock",
        "s&p",
        "nasdaq",
        "treasury",
        "bank",
    ],
    "economics": ["cpi", "jobs", "unemployment", "gdp", "inflation", "recession", "macro"],
    "politics": [
        "election",
        "president",
        "congress",
        "senate",
        "trump",
        "biden",
        "vote",
        "primary",
        "democrat",
        "republican",
    ],
    "sports": ["nfl", "nba", "mlb", "soccer", "football", "championship", "super bowl", "world cup"],
    "entertainment": ["oscar", "grammy", "movie", "box office", "celebrity", "tv", "streaming"],
    "science": ["nasa", "space", "climate", "vaccine", "fda", "science"],
    "tech": ["ai", "openai", "apple", "google", "microsoft", "tech", "chip", "semiconductor"],
}


def _normalized(
    *,
    request: dict[str, Any],
    data: Any = None,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "ok": error is None,
        "source": "walletMonitor",
        "request": request,
        "data": data if error is None else None,
        "error": error,
    }


def _split_csv(raw: str | None) -> list[str]:
    if not raw:
        return []
    parts = re.split(r"[,;\n]+", raw)
    return [p.strip() for p in parts if p.strip()]


def _normalize_categories(raw: str | None) -> list[str]:
    categories: list[str] = []
    for piece in _split_csv(raw):
        slug = piece.lower().replace(" ", "-").replace("_", "-")
        if slug:
            categories.append(slug)
    return list(dict.fromkeys(categories))


def _normalize_suppress(raw: str | None) -> list[str]:
    tokens: list[str] = []
    for piece in _split_csv(raw):
        lowered = piece.lower().strip()
        if lowered:
            tokens.append(lowered)
    return tokens


def _title_blob(trade: dict[str, Any]) -> str:
    parts = [
        str(trade.get("title") or ""),
        str(trade.get("market") or ""),
        str(trade.get("ticker") or ""),
        str(trade.get("event_ticker") or ""),
        str(trade.get("subtitle") or ""),
    ]
    return " ".join(parts).lower()


def _matches_category(title: str, categories: list[str]) -> tuple[bool, str | None]:
    if not categories:
        return True, None
    for category in categories:
        keywords = CATEGORY_KEYWORDS.get(category, [category.replace("-", " ")])
        for keyword in keywords:
            if keyword in title:
                return True, category
    return False, None


def _is_suppressed(title: str, suppress_keywords: list[str]) -> tuple[bool, list[str]]:
    if not suppress_keywords:
        return False, []
    matched = [kw for kw in suppress_keywords if kw in title]
    return bool(matched), matched


def _format_polymarket_trade(row: dict[str, Any], wallet: str) -> dict[str, Any]:
    size = float(row.get("size") or 0)
    price = float(row.get("price") or 0)
    return {
        "platform": "polymarket",
        "wallet": wallet,
        "title": row.get("title", ""),
        "side": row.get("side", ""),
        "outcome": row.get("outcome", ""),
        "size": size,
        "price": price,
        "usd": size * price,
        "timestamp": row.get("timestamp"),
        "txHash": row.get("transactionHash", ""),
    }


async def _fetch_polymarket_trades(client: httpx.AsyncClient, wallet: str, limit: int) -> list[dict[str, Any]]:
    res = await client.get(f"{DATA_BASE}/trades", params={"user": wallet, "limit": limit})
    if res.status_code >= 400:
        raise RuntimeError(f"Polymarket trades failed ({res.status_code}): {res.text[:200]}")
    payload = res.json()
    rows = payload if isinstance(payload, list) else []
    return [_format_polymarket_trade(row, wallet) for row in rows if isinstance(row, dict)]


async def _fetch_kalshi_fills(
    client: httpx.AsyncClient,
    *,
    api_key_id: str,
    private_key_pem: str,
    limit: int,
) -> list[dict[str, Any]]:
    path = "/trade-api/v2/portfolio/fills"
    url = f"{KALSHI_BASE}/portfolio/fills"
    headers = _kalshi_auth_headers(api_key_id, private_key_pem, "GET", path)
    res = await client.get(url, headers=headers, params={"limit": limit})
    if res.status_code >= 400:
        raise RuntimeError(f"Kalshi fills failed ({res.status_code}): {res.text[:200]}")
    payload = res.json() if res.content else {}
    fills = payload.get("fills") if isinstance(payload, dict) else []
    if not isinstance(fills, list):
        return []
    formatted: list[dict[str, Any]] = []
    for fill in fills:
        if not isinstance(fill, dict):
            continue
        formatted.append(
            {
                "platform": "kalshi",
                "wallet": api_key_id,
                "title": fill.get("ticker") or fill.get("market_ticker") or "",
                "ticker": fill.get("ticker") or fill.get("market_ticker") or "",
                "side": fill.get("side", ""),
                "action": fill.get("action", ""),
                "count": fill.get("count"),
                "price": fill.get("yes_price") or fill.get("no_price"),
                "timestamp": fill.get("created_time") or fill.get("ts"),
            }
        )
    return formatted


def _filter_trades(
    trades: list[dict[str, Any]],
    *,
    categories: list[str],
    suppress_keywords: list[str],
    limit: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    alerts: list[dict[str, Any]] = []
    suppressed: list[dict[str, Any]] = []

    for trade in trades:
        title = _title_blob(trade)
        suppressed_flag, suppress_hits = _is_suppressed(title, suppress_keywords)
        if suppressed_flag:
            suppressed.append({**trade, "suppressMatched": suppress_hits})
            continue
        category_ok, matched_category = _matches_category(title, categories)
        if not category_ok:
            continue
        alerts.append({**trade, "matchedCategory": matched_category})

    return alerts[:limit], suppressed[:limit]


async def fetch_wallet_monitor(body: dict[str, Any]) -> dict[str, Any]:
    access_mode, endpoint, access_error = resolve_access("walletMonitor", body, default_endpoint="poll")
    platform = (body.get("platform") or body.get("walletMonitorPlatform") or "").strip().lower()
    wallets = _split_csv(body.get("wallets") or body.get("walletMonitorWallets"))
    categories = _normalize_categories(body.get("categories") or body.get("walletMonitorCategories"))
    suppress_keywords = _normalize_suppress(
        body.get("suppressKeywords") or body.get("walletMonitorSuppressKeywords")
    )
    limit = int(body.get("limit") or body.get("walletMonitorLimit") or 20)
    api_key_id = (body.get("apiKey") or body.get("kalshiApiKey") or "").strip()
    private_key_pem = (body.get("apiSecret") or body.get("kalshiApiSecret") or "").strip()

    request = {
        "accessMode": access_mode,
        "endpoint": endpoint,
        "platform": platform,
        "wallets": wallets,
        "categories": categories,
        "suppressKeywords": suppress_keywords,
        "limit": limit,
    }

    if access_error:
        return _normalized(request=request, error=access_error)
    if platform not in ("polymarket", "kalshi"):
        return _normalized(
            request=request,
            error="platform must be 'polymarket' or 'kalshi' — monitor one platform at a time",
        )
    if platform == "polymarket" and not wallets:
        return _normalized(request=request, error="At least one Polymarket wallet address (0x…) is required")
    if not categories:
        return _normalized(
            request=request,
            error="At least one category is required — e.g. geopolitics, crypto, politics",
        )

    if endpoint == "configure":
        return _normalized(
            request=request,
            data={
                "configured": True,
                "platform": platform,
                "wallets": wallets,
                "categories": categories,
                "suppressKeywords": suppress_keywords,
                "categoryKeywords": {cat: CATEGORY_KEYWORDS.get(cat, [cat]) for cat in categories},
            },
        )

    timeout = TOOL_FETCH_TIMEOUT_MS / 1000
    trades: list[dict[str, Any]] = []
    errors: list[str] = []

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            if platform == "polymarket":
                for wallet in wallets[:5]:
                    if not wallet.lower().startswith("0x"):
                        errors.append(f"Invalid Polymarket wallet: {wallet}")
                        continue
                    try:
                        trades.extend(await _fetch_polymarket_trades(client, wallet, limit))
                    except Exception as exc:
                        errors.append(f"{wallet}: {exc}")
            else:
                if not api_key_id or not private_key_pem:
                    return _normalized(
                        request=request,
                        error=(
                            "Kalshi wallet monitor requires API key ID + PEM private key on the node — "
                            "Kalshi does not expose third-party wallet activity publicly; "
                            "this polls fills for the authenticated account."
                        ),
                    )
                try:
                    trades = await _fetch_kalshi_fills(
                        client,
                        api_key_id=api_key_id,
                        private_key_pem=private_key_pem,
                        limit=limit,
                    )
                except Exception as exc:
                    errors.append(str(exc))
    except Exception as exc:
        return _normalized(request=request, error=str(exc))

    alerts, suppressed = _filter_trades(
        trades,
        categories=categories,
        suppress_keywords=suppress_keywords,
        limit=limit,
    )

    return _normalized(
        request=request,
        data={
            "platform": platform,
            "alerts": alerts,
            "alertCount": len(alerts),
            "suppressedCount": len(suppressed),
            "suppressedSample": suppressed[:5],
            "monitoredWallets": wallets if platform == "polymarket" else [],
            "errors": errors,
        },
    )
