"""Shared tool invocation helpers for sub-agents."""

from __future__ import annotations

from typing import Any

from app.orchestrator.tools_registry import ToolRegistry

NEWS_FEED_TOOLS = frozenset({"cryptonews", "tavily"})
ARB_SCAN_TOOLS = frozenset({"polymarketGamma", "kalshi"})
RISK_TOOLS = frozenset({"polymarketGamma", "polymarketWallet", "kalshi"})


async def invoke_execution_tools(
    execution_tools: list[str],
    tool_configs: dict[str, dict[str, Any]],
    planned_calls: list[dict[str, Any]],
) -> dict[str, Any]:
    registry = ToolRegistry(execution_tools)
    enriched: list[dict[str, Any]] = []
    for call in planned_calls:
        tool_id = call.get("tool_id") or ""
        if tool_id not in execution_tools:
            continue
        params = dict(call.get("params") or {})
        api_key = (tool_configs.get(tool_id) or {}).get("apiKey") or ""
        if api_key:
            params["apiKey"] = api_key
        enriched.append({**call, "params": params})
    return await registry.invoke_parallel(enriched)


def _articles_from_cryptonews(result: dict[str, Any]) -> list[dict[str, Any]]:
    if not result.get("ok"):
        return []
    data = result.get("data") or {}
    raw = data.get("data") if isinstance(data, dict) else data
    if not isinstance(raw, list):
        return []
    articles: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        title = (item.get("title") or item.get("headline") or "").strip()
        if not title:
            continue
        articles.append(
            {
                "title": title,
                "summary": (item.get("text") or item.get("description") or item.get("summary") or "").strip(),
                "url": item.get("news_url") or item.get("url") or "",
                "publishedAt": item.get("date") or item.get("published_at"),
                "source": item.get("source_name") or "CryptoNews",
            }
        )
    return articles


def _articles_from_tavily(result: dict[str, Any]) -> list[dict[str, Any]]:
    if not result.get("ok"):
        return []
    data = result.get("data") or {}
    raw = data.get("results") if isinstance(data, dict) else []
    if not isinstance(raw, list):
        return []
    articles: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        title = (item.get("title") or "").strip()
        if not title:
            continue
        articles.append(
            {
                "title": title,
                "summary": (item.get("content") or "").strip()[:500],
                "url": item.get("url") or "",
                "publishedAt": None,
                "source": "Tavily",
            }
        )
    return articles


async def fetch_headlines_from_tools(
    execution_tools: list[str],
    tool_configs: dict[str, dict[str, Any]],
    *,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Poll feed tools wired to a news subagent."""
    feed_tools = [t for t in execution_tools if t in NEWS_FEED_TOOLS]
    if not feed_tools:
        return []

    planned: list[dict[str, Any]] = []
    if "cryptonews" in feed_tools:
        cfg = tool_configs.get("cryptonews") or {}
        planned.append(
            {
                "tool_id": "cryptonews",
                "params": {
                    "endpoint": "general_news",
                    "items": int(cfg.get("items") or limit),
                    "apiKey": cfg.get("apiKey"),
                },
            }
        )
    if "tavily" in feed_tools:
        cfg = tool_configs.get("tavily") or {}
        planned.append(
            {
                "tool_id": "tavily",
                "params": {
                    "query": cfg.get("query") or "crypto market news",
                    "maxResults": int(cfg.get("maxResults") or min(limit, 10)),
                    "apiKey": cfg.get("apiKey"),
                },
            }
        )

    results = await invoke_execution_tools(execution_tools, tool_configs, planned)
    articles: list[dict[str, Any]] = []
    if "cryptonews" in results:
        articles.extend(_articles_from_cryptonews(results["cryptonews"]))
    if "tavily" in results:
        articles.extend(_articles_from_tavily(results["tavily"]))
    return articles[:limit]


def _normalize_poly_market(m: dict[str, Any]) -> dict[str, Any] | None:
    from datetime import datetime, timezone

    title = m.get("question") or m.get("title") or ""
    if not title:
        return None
    try:
        best_bid = float(m.get("bestBid") or 0)
        best_ask = float(m.get("bestAsk") or 0)
    except (TypeError, ValueError):
        best_bid, best_ask = 0.0, 0.0
    if not (0 < best_ask < 1) and m.get("outcomePrices"):
        prices = m.get("outcomePrices")
        if isinstance(prices, list) and prices:
            try:
                best_ask = float(prices[0])
            except (TypeError, ValueError):
                return None
    if not (0 < best_ask < 1):
        return None
    close_dt = None
    end = m.get("endDate") or m.get("end_date_iso")
    if end:
        try:
            close_dt = datetime.fromisoformat(str(end).replace("Z", "+00:00"))
        except ValueError:
            close_dt = None
    slug = m.get("slug") or ""
    return {
        "platform": "polymarket",
        "title": title,
        "slug": slug,
        "url": f"https://polymarket.com/market/{slug}" if slug else "",
        "yes_ask": best_ask,
        "no_ask": 1.0 - best_bid if best_bid > 0 else 1.0,
        "liquidity": float(m.get("liquidity") or 0),
        "volume_24h": float(m.get("volume24hr") or m.get("volume_24h") or 0),
        "close_dt": close_dt,
    }


def _normalize_kalshi_market(m: dict[str, Any]) -> dict[str, Any] | None:
    from datetime import datetime, timezone

    title = m.get("title") or ""
    yes_ask, no_ask = m.get("yes_ask"), m.get("no_ask")
    if not title or yes_ask is None or no_ask is None:
        return None
    close_dt = None
    close_raw = m.get("close_time") or m.get("close_ts")
    if close_raw:
        try:
            close_dt = datetime.fromisoformat(str(close_raw).replace("Z", "+00:00"))
        except ValueError:
            close_dt = None
    ticker = m.get("ticker") or ""
    try:
        ya = float(yes_ask)
        na = float(no_ask)
        if ya > 1:
            ya /= 100.0
        if na > 1:
            na /= 100.0
    except (TypeError, ValueError):
        return None
    liq = float(m.get("liquidity") or 0)
    if liq > 500:
        liq /= 100.0
    vol = float(m.get("volume_24h") or m.get("volume") or 0)
    return {
        "platform": "kalshi",
        "title": title,
        "ticker": ticker,
        "url": f"https://kalshi.com/markets/{ticker}" if ticker else "",
        "yes_ask": ya,
        "no_ask": na,
        "liquidity": liq,
        "volume_24h": vol,
        "close_dt": close_dt,
    }


async def fetch_scan_markets_from_tools(
    execution_tools: list[str],
    tool_configs: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Fetch Polymarket + Kalshi market lists via tool registry."""
    planned: list[dict[str, Any]] = []
    if "polymarketGamma" in execution_tools:
        planned.append(
            {
                "tool_id": "polymarketGamma",
                "params": {"endpoint": "markets_list", "limit": 200},
            }
        )
    if "kalshi" in execution_tools:
        planned.append(
            {
                "tool_id": "kalshi",
                "params": {"action": "list_markets", "limit": 200, "pages": 3},
            }
        )

    results = await invoke_execution_tools(execution_tools, tool_configs, planned)
    poly: list[dict[str, Any]] = []
    kalshi: list[dict[str, Any]] = []

    gamma = results.get("polymarketGamma") or {}
    if gamma.get("ok"):
        for m in (gamma.get("data") or {}).get("markets") or []:
            norm = _normalize_poly_market(m)
            if norm:
                poly.append(norm)

    kal = results.get("kalshi") or {}
    if kal.get("ok"):
        for m in (kal.get("data") or {}).get("markets") or []:
            norm = _normalize_kalshi_market(m)
            if norm:
                kalshi.append(norm)

    return poly, kalshi


def _market_from_gamma(
    gamma_result: dict[str, Any],
    *,
    market_id: str = "",
    keywords: str = "",
) -> dict[str, Any] | None:
    if not gamma_result.get("ok"):
        return None
    markets = (gamma_result.get("data") or {}).get("markets") or []
    if not markets:
        return None
    slug = market_id.lower().strip()
    if slug:
        for m in markets:
            if not isinstance(m, dict):
                continue
            if (m.get("slug") or "").lower() == slug:
                return m
            if slug in (m.get("question") or "").lower():
                return m
    if keywords:
        kw = keywords.lower()
        for m in markets:
            if kw in (m.get("question") or "").lower():
                return m
    return markets[0] if isinstance(markets[0], dict) else None


def _open_exposure_from_wallet(wallet_result: dict[str, Any]) -> float:
    if not wallet_result.get("ok"):
        return 0.0
    data = wallet_result.get("data") or {}
    positions = data.get("positions") or data.get("data") or []
    if not isinstance(positions, list):
        return 0.0
    total = 0.0
    for pos in positions:
        if not isinstance(pos, dict):
            continue
        for key in ("currentValue", "value", "size", "initialValue"):
            try:
                total += abs(float(pos.get(key) or 0))
                break
            except (TypeError, ValueError):
                continue
    return total


async def fetch_risk_context_from_tools(
    execution_tools: list[str],
    tool_configs: dict[str, dict[str, Any]],
    *,
    market_id: str = "",
    keywords: str = "",
    venue: str = "polymarket",
) -> dict[str, Any]:
    """Fetch market liquidity and wallet exposure for risk sizing."""
    planned: list[dict[str, Any]] = []
    evidence: list[str] = []

    if "polymarketGamma" in execution_tools and venue == "polymarket":
        cfg = tool_configs.get("polymarketGamma") or {}
        planned.append(
            {
                "tool_id": "polymarketGamma",
                "params": {
                    "endpoint": "markets_search",
                    "keywords": keywords or market_id or "bitcoin",
                    "limit": int(cfg.get("limit") or 8),
                },
            }
        )
    if "kalshi" in execution_tools and venue == "kalshi":
        planned.append(
            {
                "tool_id": "kalshi",
                "params": {"action": "list_markets", "limit": 50, "pages": 1},
            }
        )
    if "polymarketWallet" in execution_tools:
        cfg = tool_configs.get("polymarketWallet") or {}
        wallet = (cfg.get("wallet") or cfg.get("pmWallet") or "").strip()
        if wallet:
            planned.append(
                {
                    "tool_id": "polymarketWallet",
                    "params": {
                        "endpoint": "wallet_positions",
                        "wallet": wallet,
                        "action": "positions",
                        "limit": int(cfg.get("limit") or 50),
                    },
                }
            )

    if not planned:
        return {"market": None, "open_exposure_usd": 0.0, "evidence": evidence}

    results = await invoke_execution_tools(execution_tools, tool_configs, planned)
    market: dict[str, Any] | None = None

    gamma = results.get("polymarketGamma") or {}
    if gamma:
        market = _market_from_gamma(gamma, market_id=market_id, keywords=keywords)
        if market:
            liq = float(market.get("liquidity") or 0)
            evidence.append(f"Gamma: liquidity ${liq:,.0f}, quality {market.get('quality', 'n/a')}")

    if venue == "kalshi" and not market:
        kal = results.get("kalshi") or {}
        if kal.get("ok"):
            for m in (kal.get("data") or {}).get("markets") or []:
                if not isinstance(m, dict):
                    continue
                ticker = (m.get("ticker") or "").lower()
                if market_id and ticker == market_id.lower():
                    market = {
                        "question": m.get("title") or "",
                        "ticker": m.get("ticker") or "",
                        "liquidity": float(m.get("liquidity") or 0),
                        "yes_ask": m.get("yes_ask"),
                        "no_ask": m.get("no_ask"),
                        "bestAsk": float(m.get("yes_ask") or 0) / 100.0
                        if float(m.get("yes_ask") or 0) > 1
                        else float(m.get("yes_ask") or 0),
                    }
                    evidence.append(f"Kalshi: {market['question'][:60]} liquidity ${market['liquidity']:,.0f}")
                    break

    wallet = results.get("polymarketWallet") or {}
    open_exposure = _open_exposure_from_wallet(wallet)
    if open_exposure > 0:
        evidence.append(f"Wallet open exposure ~${open_exposure:,.0f}")

    return {
        "market": market,
        "open_exposure_usd": open_exposure,
        "evidence": evidence,
    }
