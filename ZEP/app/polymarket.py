"""Polymarket Gamma API — market discovery by keyword or tag (ZEP-local port)."""
from __future__ import annotations

import json
import re
from typing import Any

import httpx

GAMMA_BASE = "https://gamma-api.polymarket.com"
GAMMA_MARKETS = f"{GAMMA_BASE}/markets"
GAMMA_PUBLIC_SEARCH = f"{GAMMA_BASE}/public-search"
FETCH_TIMEOUT_S = 15.0

VOLUME_RED_FLAG = 10_000.0
VOLUME_SWEET_LO = 50_000.0
VOLUME_SWEET_HI = 500_000.0
SPREAD_IDEAL = 0.02
SPREAD_MAX = 0.05
LIQUIDITY_MIN = 10_000.0
LIQUIDITY_FULL = 50_000.0

# Maps user topic tokens → Polymarket tag slugs for category-level browsing.
# Sports match titles ("Panama vs. England") don't contain "soccer" in the text,
# so keyword search alone fails. Tag search fetches the full category page instead.
_TOPIC_TO_TAG_SLUG: dict[str, str] = {
    "soccer": "soccer",
    "football": "football",
    "cricket": "cricket",
    "ipl": "cricket",
    "baseball": "baseball",
    "tennis": "tennis",
    "basketball": "basketball",
    "nba": "basketball",
    "nfl": "football",
    "ufc": "ufc",
    "mma": "ufc",
    "golf": "golf",
    "fifa": "world-cup",
    "worldcup": "world-cup",
    "uefa": "soccer",
    "ucl": "soccer",
    "premier": "soccer",
    "champions": "soccer",
    "mls": "soccer",
    "epl": "soccer",
    "laliga": "soccer",
    "bundesliga": "soccer",
    "ligue": "soccer",
    "seriea": "soccer",
    "wnba": "basketball",
    "mlb": "baseball",
    "nhl": "hockey",
    "hockey": "hockey",
    "formula": "motorsports",
    "company": "stocks",
    "companies": "stocks",
    "stock": "stocks",
    "stocks": "stocks",
    "equity": "stocks",
    "equities": "stocks",
    "marketcap": "stocks",
    "weather": "weather",
    "wether": "weather",
    "temperature": "weather",
    "temperatures": "weather",
    "precipitation": "weather",
    "rain": "weather",
    "rainfall": "weather",
    "tornado": "weather",
    "tornadoes": "weather",
    "hurricane": "weather",
    "hurricanes": "weather",
    "earthquake": "weather",
    "earthquakes": "weather",
}


def topic_tag_slug(keywords: list[str]) -> str | None:
    """Return the first Polymarket tag slug that matches any keyword, or None."""
    slugs = topic_tag_slugs(keywords)
    return slugs[0] if slugs else None


def _slugify(text: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")


def topic_tag_slugs(keywords: list[str]) -> list[str]:
    """Generate possible Polymarket tag slugs from topic words.

    This is intentionally generic: it includes known aliases when useful, but
    also tries query-derived slugs like "taylor-swift", "weather", or
    "federal-reserve" so the system can discover any Polymarket topic.
    """
    kw_set = {kw.lower() for kw in keywords}
    candidates: list[str] = []

    def add(slug: str | None) -> None:
        if slug and slug not in candidates:
            candidates.append(slug)

    if "fifa" in kw_set or "worldcup" in kw_set or {"world", "cup"}.issubset(kw_set):
        add("world-cup")

    for kw in keywords:
        norm = "weather" if kw.lower() == "wether" else kw.lower()
        add(_TOPIC_TO_TAG_SLUG.get(norm))
        add(_slugify(norm))

    # Add adjacent phrase slugs from the query/topic tokens.
    normalized = ["weather" if kw.lower() == "wether" else kw.lower() for kw in keywords]
    for width in (3, 2):
        for i in range(0, max(0, len(normalized) - width + 1)):
            add(_slugify(" ".join(normalized[i:i + width])))

    return candidates[:8]


def quality_score(volume_24h: float, spread: float, liquidity: float) -> float:
    """Composite market-quality score in [0, 1]."""
    if volume_24h < VOLUME_SWEET_LO:
        vol = max(0.0, (volume_24h - VOLUME_RED_FLAG) / (VOLUME_SWEET_LO - VOLUME_RED_FLAG)) * 0.8
    elif volume_24h <= VOLUME_SWEET_HI:
        vol = 1.0
    else:
        vol = 0.85

    if spread <= SPREAD_IDEAL:
        spr = 1.0
    elif spread >= SPREAD_MAX:
        spr = 0.0
    else:
        spr = 1.0 - (spread - SPREAD_IDEAL) / (SPREAD_MAX - SPREAD_IDEAL)

    liq = min(1.0, max(0.0, (liquidity - LIQUIDITY_MIN) / (LIQUIDITY_FULL - LIQUIDITY_MIN)))
    return round(0.40 * vol + 0.35 * spr + 0.25 * liq, 3)


def parse_gamma_market(m: dict[str, Any]) -> dict[str, Any] | None:
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

    event_text_parts: list[str] = []
    event_slug = ""
    for event in m.get("events") or []:
        if not isinstance(event, dict):
            continue
        if not event_slug:
            event_slug = str(event.get("slug") or "").strip()
        event_text_parts.extend(
            str(event.get(key) or "")
            for key in ("title", "slug", "ticker", "description")
        )
        metadata = event.get("eventMetadata") or {}
        if isinstance(metadata, dict):
            event_text_parts.extend(str(value or "") for value in metadata.values())

    return {
        "question": question,
        "id": m.get("id") or "",
        "slug": m.get("slug", ""),
        "eventSlug": event_slug,
        "conditionId": m.get("conditionId", ""),
        "description": m.get("description", "") or "",
        "eventText": " ".join(part for part in event_text_parts if part),
        "outcomes": outcomes or [],
        "outcomePrices": [float(p) for p in (prices or [])],
        "volume": float(m.get("volume") or m.get("volumeNum") or 0),
        "volume24hr": volume,
        "liquidity": liquidity,
        "startDate": m.get("startDate") or m.get("startDateIso") or "",
        "endDate": m.get("endDate") or m.get("endDateIso") or "",
        "createdAt": m.get("createdAt") or "",
        "bestBid": best_bid or None,
        "bestAsk": best_ask or None,
        "spread": spread,
        "quality": quality_score(volume, spread if spread is not None else SPREAD_MAX, liquidity),
    }


def _passes_gates(
    m: dict[str, Any],
    min_volume_24h: float,
    min_liquidity: float,
    max_spread: float,
) -> bool:
    if m["volume24hr"] < min_volume_24h or m["liquidity"] < min_liquidity:
        return False
    if m["spread"] is not None and m["spread"] > max_spread:
        return False
    return True


def _normalize_keywords(raw_keywords: str | list[str]) -> list[str]:
    if isinstance(raw_keywords, list):
        return [str(k).strip().lower() for k in raw_keywords if str(k).strip()]
    return [part.strip().lower() for part in str(raw_keywords).split(",") if part.strip()]


async def _fetch_raw_markets(
    *,
    extra_params: dict[str, Any] | None = None,
    page_limit: int = 200,
) -> list[dict[str, Any]]:
    """Fetch raw market list from Gamma, with optional extra params (e.g. tag_slug)."""
    params: dict[str, Any] = {
        "closed": "false",
        "active": "true",
        "limit": page_limit,
        "order": "volume24hr",
        "ascending": "false",
    }
    if extra_params:
        params.update(extra_params)

    async with httpx.AsyncClient(timeout=FETCH_TIMEOUT_S) as client:
        response = await client.get(GAMMA_MARKETS, params=params)
        response.raise_for_status()
        raw = response.json()

    return raw if isinstance(raw, list) else []


async def _fetch_raw_events(
    *,
    extra_params: dict[str, Any] | None = None,
    page_limit: int = 50,
) -> list[dict[str, Any]]:
    params: dict[str, Any] = {
        "closed": "false",
        "active": "true",
        "limit": page_limit,
        "order": "volume24hr",
        "ascending": "false",
    }
    if extra_params:
        params.update(extra_params)

    async with httpx.AsyncClient(timeout=FETCH_TIMEOUT_S) as client:
        response = await client.get(f"{GAMMA_BASE}/events", params=params)
        response.raise_for_status()
        raw = response.json()

    return raw if isinstance(raw, list) else []


async def _fetch_public_search(
    query: str,
    *,
    limit_per_type: int = 20,
    page: int = 0,
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "q": query,
        "limit_per_type": limit_per_type,
        "page": page,
        "events_status": "active",
        "search_tags": "false",
        "search_profiles": "false",
    }
    async with httpx.AsyncClient(timeout=FETCH_TIMEOUT_S) as client:
        response = await client.get(GAMMA_PUBLIC_SEARCH, params=params)
        response.raise_for_status()
        raw = response.json()

    return raw if isinstance(raw, dict) else {}


def _market_dedupe_key(market: dict[str, Any]) -> str:
    return (
        str(market.get("conditionId") or "").strip()
        or str(market.get("id") or "").strip()
        or str(market.get("slug") or "").strip()
    )


def _markets_from_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    flattened: list[dict[str, Any]] = []
    for event in events:
        if not isinstance(event, dict):
            continue
        event_payload = {
            key: event.get(key)
            for key in (
                "id", "ticker", "slug", "title", "description", "resolutionSource",
                "startDate", "creationDate", "endDate", "image", "icon", "active",
                "closed", "archived", "new", "featured", "restricted", "liquidity",
                "volume", "openInterest", "volume24hr", "volume1wk", "volume1mo",
                "volume1yr", "competitive", "eventMetadata",
            )
        }
        for market in event.get("markets") or []:
            if not isinstance(market, dict):
                continue
            item = dict(market)
            item["events"] = [event_payload]
            flattened.append(item)
    return flattened


def _markets_from_public_search(payload: dict[str, Any]) -> list[dict[str, Any]]:
    events = payload.get("events") or []
    if not isinstance(events, list):
        return []
    return _markets_from_events([e for e in events if isinstance(e, dict)])


async def search_public_markets(
    query: str,
    *,
    limit: int = 100,
    min_volume_24h: float = 0,
    min_liquidity: float = 0,
    max_spread: float = SPREAD_MAX,
) -> list[dict[str, Any]]:
    """Search Gamma `/public-search`, flatten event markets, parse + gate locally."""
    q = str(query or "").strip()
    if not q:
        return []

    payload = await _fetch_public_search(q, limit_per_type=max(limit, 20), page=0)
    flattened = _markets_from_public_search(payload)

    deduped: dict[str, dict[str, Any]] = {}
    for market in flattened:
        key = _market_dedupe_key(market)
        if key:
            deduped[key] = market

    parsed_markets: list[dict[str, Any]] = []
    for market in deduped.values():
        parsed = parse_gamma_market(market)
        if not parsed:
            continue
        if _passes_gates(parsed, min_volume_24h, min_liquidity, max_spread):
            parsed_markets.append(parsed)

    parsed_markets.sort(key=lambda item: -item["quality"])
    return parsed_markets[:limit]


async def search_markets(
    keywords: str | list[str],
    *,
    limit: int = 8,
    min_volume_24h: float = VOLUME_RED_FLAG,
    min_liquidity: float = LIQUIDITY_MIN,
    max_spread: float = SPREAD_MAX,
) -> list[dict[str, Any]]:
    """Fetch candidate Gamma markets for downstream relevance ranking.

    This intentionally returns a candidate pool rather than trusting substring
    matching as the final relevance check. Callers score rich metadata
    (question, slug, description, event text) before displaying anything.
    """
    kw_list = _normalize_keywords(keywords)
    if not kw_list:
        return []

    # Collect raw markets: always fetch the global top-200, plus the tag page
    # if a relevant category is detected (deduped by slug).
    raw_by_slug: dict[str, dict] = {}

    global_raw = await _fetch_raw_markets()
    for m in global_raw:
        slug = m.get("slug") or m.get("conditionId") or ""
        if slug:
            raw_by_slug[slug] = m

    for tag_slug in topic_tag_slugs(kw_list):
        try:
            event_raw = _markets_from_events(await _fetch_raw_events(
                extra_params={"tag_slug": tag_slug},
                page_limit=50,
            ))
            for m in event_raw:
                slug = m.get("slug") or m.get("conditionId") or ""
                if slug:
                    raw_by_slug[slug] = m

            tag_raw = await _fetch_raw_markets(
                extra_params={"tag_slug": tag_slug},
                page_limit=100,
            )
            for m in tag_raw:
                slug = m.get("slug") or m.get("conditionId") or ""
                if slug:
                    raw_by_slug[slug] = m
        except Exception:  # noqa: BLE001 — tag search is best-effort
            pass

    markets: list[dict[str, Any]] = []
    for m in raw_by_slug.values():
        parsed = parse_gamma_market(m)
        if not parsed:
            continue
        if _passes_gates(parsed, min_volume_24h, min_liquidity, max_spread):
            markets.append(parsed)

    markets.sort(key=lambda item: -item["quality"])
    return markets[:limit]


async def list_markets(
    *,
    limit: int = 200,
    order: str = "volume24hr",
    ascending: bool = False,
    min_volume_24h: float = 0,
    min_liquidity: float = 0,
    max_spread: float = SPREAD_MAX,
) -> list[dict[str, Any]]:
    """Fetch a broad market list for discovery/filter prompts."""
    raw = await _fetch_raw_markets(
        extra_params={
            "order": order,
            "ascending": "true" if ascending else "false",
        },
        page_limit=limit,
    )

    markets: list[dict[str, Any]] = []
    for m in raw:
        parsed = parse_gamma_market(m)
        if not parsed:
            continue
        if _passes_gates(parsed, min_volume_24h, min_liquidity, max_spread):
            markets.append(parsed)
    return markets[:limit]


async def search_markets_by_tag(
    tag_slug: str,
    *,
    limit: int = 8,
    min_volume_24h: float = VOLUME_RED_FLAG,
    min_liquidity: float = LIQUIDITY_MIN,
    max_spread: float = SPREAD_MAX,
) -> list[dict[str, Any]]:
    """Fetch markets from a specific Polymarket category tag without keyword filtering.

    Used when the user asks for a sports category and there are no keyword matches
    in market titles (e.g. "show me soccer markets" → tag_slug="soccer" returns all
    active soccer markets regardless of whether titles contain the word "soccer").
    """
    raw_by_slug: dict[str, dict[str, Any]] = {}

    for m in _markets_from_events(await _fetch_raw_events(
        extra_params={"tag_slug": tag_slug},
        page_limit=50,
    )):
        slug = m.get("slug") or m.get("conditionId") or ""
        if slug:
            raw_by_slug[slug] = m

    for m in await _fetch_raw_markets(extra_params={"tag_slug": tag_slug}, page_limit=100):
        slug = m.get("slug") or m.get("conditionId") or ""
        if slug:
            raw_by_slug[slug] = m

    markets: list[dict[str, Any]] = []
    for m in raw_by_slug.values():
        parsed = parse_gamma_market(m)
        if not parsed:
            continue
        if _passes_gates(parsed, min_volume_24h, min_liquidity, max_spread):
            markets.append(parsed)

    markets.sort(key=lambda item: -item["quality"])
    return markets[:limit]
