"""Preference-driven Polymarket lookup — shared by chat and voice."""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from zep_cloud.client import Zep

from config import Settings
from graph_snapshot import fetch_user_graph
from llm import generate_reply
from polymarket import list_markets, search_markets, search_public_markets

logger = logging.getLogger(__name__)

_STOPWORDS = frozenset({
    "me", "my", "we", "us", "it", "is", "am", "be", "to", "of", "on", "in", "or", "if",
    "as", "at", "by", "an", "no", "so", "do", "up",
    "the", "and", "for", "are", "but", "not", "you", "all", "can", "her", "was",
    "one", "our", "out", "has", "have", "had", "this", "that", "with", "from",
    "they", "been", "have", "will", "would", "there", "their", "what", "when",
    "who", "how", "why", "user", "preference", "interested", "interest", "focus",
    "about", "into", "more", "also", "than", "then", "them", "these", "those",
    "such", "some", "any", "each", "which", "while", "where", "being", "through",
})

# Extended stopwords for query-to-preference matching. Generic action words and
# market-related nouns must be blocked, otherwise "markets" in a query phrase
# accidentally matches every preference that mentions the word "markets".
_QUERY_FILTER_STOPWORDS = _STOPWORDS | frozenset({
    "show", "list", "fetch", "find", "get", "pull", "search", "give", "tell",
    "see", "check", "look", "display", "bring",
    "market", "markets", "polymarket", "poly", "trading", "trade", "trades",
    "related", "matching", "match", "preference", "preferences", "pref", "prefs",
    "them", "those", "these", "all", "here", "now", "like", "want",
    "can", "could", "would", "please", "hey", "okay", "oky", "alright",
    "currently", "available", "live", "real", "time", "realtime",
    "just", "only", "very", "also", "even", "still",
    "today", "week", "daily", "weekly", "previous", "current", "positions",
    "position", "portfolio", "hedge", "monitor", "strategy", "strategies",
    "should", "similar", "based", "expiring", "next", "hours",
    # Adjective/adverb noise that causes cross-topic pref leakage
    "based", "ongoing", "current", "recent", "latest", "active", "new",
    "high", "low", "top", "best", "big", "good", "open", "hot",
})

# Stopwords for deriving searchable market keywords from preference text.
# These are broader than general stopwords to avoid noisy matches such as
# "team" or "matches" pulling unrelated sports/geopolitical markets.
_PREF_KEYWORD_STOPWORDS = _STOPWORDS | frozenset({
    "market", "markets", "polymarket", "prediction", "predictions",
    "trade", "trading", "contract", "contracts",
    "team", "teams", "match", "matches", "game", "games",
    "sport", "sports", "event", "events", "tournament", "tournaments",
    "interest", "interests", "focused", "focus", "based", "related",
})

_QUERY_EXPANSIONS: dict[str, tuple[str, ...]] = {
    "ai": ("artificial", "intelligence", "openai", "anthropic"),
    "us": ("usa", "america", "election", "politics"),
    "usa": ("us", "america", "election", "politics"),
    "soccer": ("football", "fifa", "world", "cup", "uefa", "champions", "league"),
    "football": ("soccer", "fifa", "world", "cup", "uefa", "champions", "league"),
    "fifa": ("world", "cup", "soccer", "football"),
    "worldcup": ("world", "cup", "fifa", "soccer", "football"),
    "ipl": ("cricket",),
    "cricket": ("ipl",),
    "wether": ("weather", "temperature", "precipitation", "rain", "hurricane", "tornado"),
    "weather": ("temperature", "precipitation", "rain", "hurricane", "tornado"),
    "temperature": ("weather",),
    "rain": ("weather", "precipitation"),
    "company": ("companies", "stock", "stocks", "equity", "market", "cap"),
    "companies": ("company", "stock", "stocks", "equity", "market", "cap"),
    "largest": ("biggest", "most", "valuable", "market", "cap"),
    "biggest": ("largest", "most", "valuable", "market", "cap"),
    "valuable": ("largest", "biggest", "market", "cap"),
    "stock": ("stocks", "company", "companies", "equity"),
    "stocks": ("stock", "company", "companies", "equity"),
}

_DISCOVERY_TERMS = frozenset({
    "trending", "active", "popular", "volume", "liquidity", "liquid", "newly",
    "created", "closing", "ending", "movers", "trading", "recommend",
    "interesting", "opportunities", "today", "week", "daily", "weekly",
    "largest", "biggest", "most", "people", "right",
})

_NO_MATCH_REPLY = (
    "No Polymarket markets matched your query right now. "
    "Try a broader term or check back later as new markets list."
)

_POLYMARKET_EVENT_BASE = "https://polymarket.com/event"


@dataclass
class MarketCard:
    question: str
    slug: str
    condition_id: str
    outcomes: list[str]
    outcome_prices: list[float]
    volume24hr: float
    liquidity: float
    quality: float
    matched_preferences: list[str] = field(default_factory=list)
    matched_keywords: list[str] = field(default_factory=list)
    match_reason: str = ""
    url: str = ""
    source: str = "polymarket"

    def to_dict(self) -> dict[str, Any]:
        return {
            "question": self.question,
            "slug": self.slug,
            "conditionId": self.condition_id,
            "outcomes": self.outcomes,
            "outcomePrices": self.outcome_prices,
            "volume24hr": self.volume24hr,
            "liquidity": self.liquidity,
            "quality": self.quality,
            "matched_preferences": self.matched_preferences,
            "matched_keywords": self.matched_keywords,
            "match_reason": self.match_reason,
            "url": self.url,
            "source": self.source,
        }


@dataclass
class MarketLookupResult:
    reply: str
    markets: list[MarketCard] = field(default_factory=list)
    status: str = "ok"  # ok | no_preferences | no_matches | error

    def to_market_dicts(self) -> list[dict[str, Any]]:
        return [m.to_dict() for m in self.markets]


@dataclass
class QueryPlan:
    intent: str = "market_lookup"
    search_terms: list[str] = field(default_factory=list)
    filters: dict[str, Any] = field(default_factory=dict)
    sort: str = "relevance"


def get_preference_nodes(zep: Zep, user_id: str) -> list[dict[str, Any]]:
    graph = fetch_user_graph(zep, user_id)
    return [
        node for node in graph.get("nodes", [])
        if node.get("label") == "Preference" or "Preference" in (node.get("labels") or [])
    ]


def _pref_display_name(pref: dict[str, Any]) -> str:
    name = (pref.get("name") or "").strip()
    if name and name != "(unnamed node)":
        return name
    summary = (pref.get("summary") or "").strip()
    if summary:
        return summary[:80]
    return "Preference"


def _tokenize(text: str, stopwords: set[str] | frozenset[str] = _STOPWORDS) -> list[str]:
    tokens = re.findall(r"[a-z0-9]{3,}", text.lower())
    expanded: list[str] = []
    for token in tokens:
        if token == "worldcup":
            expanded.extend(["world", "cup"])
        else:
            expanded.append(token)
    return [t for t in expanded if t not in stopwords]


def preference_keywords(prefs: list[dict[str, Any]]) -> list[str]:
    """Extract search keywords from Preference node name + summary."""
    seen: set[str] = set()
    keywords: list[str] = []
    for pref in prefs:
        blob = f"{pref.get('name', '')} {pref.get('summary', '')}"
        for token in _tokenize(blob, _PREF_KEYWORD_STOPWORDS):
            if token not in seen:
                seen.add(token)
                keywords.append(token)
    return keywords


def filter_prefs_by_query(prefs: list[dict[str, Any]], query: str) -> list[dict[str, Any]]:
    """Narrow preferences when the user mentions a specific topic.

    Uses an extended stopword set that blocks generic action words (show, fetch,
    markets, related…) so only real topic tokens (iranian, soccer, ipl, bitcoin…)
    drive the filter. When no topic tokens remain the full preference list is
    returned unchanged (because the query is broad).

    If topic tokens exist but none of the saved Preference nodes match those
    tokens, return an empty list (strict scoping) instead of falling back to
    all preferences.
    """
    query_tokens = [t for t in re.findall(r"[a-z0-9]{3,}", query.lower())
                    if t not in _QUERY_FILTER_STOPWORDS]
    if not query_tokens:
        return prefs

    matched: list[dict[str, Any]] = []
    for pref in prefs:
        blob = f"{pref.get('name', '')} {pref.get('summary', '')}".lower()
        if any(tok in blob for tok in query_tokens):
            matched.append(pref)
    return matched


def _format_volume(volume: float) -> str:
    if volume >= 1_000_000:
        return f"${volume / 1_000_000:.1f}M"
    if volume >= 1_000:
        return f"${volume / 1_000:.0f}k"
    return f"${volume:.0f}"


def _market_url(slug: str, event_slug: str = "") -> str:
    slug = (slug or "").strip("/")
    event_slug = (event_slug or "").strip("/")
    if event_slug and slug:
        return f"{_POLYMARKET_EVENT_BASE}/{event_slug}/{slug}"
    if event_slug:
        return f"{_POLYMARKET_EVENT_BASE}/{event_slug}"
    if slug:
        return f"{_POLYMARKET_EVENT_BASE}/{slug}"
    return ""


def _market_search_text(market: dict[str, Any]) -> str:
    """Rich text used for relevance scoring, not just the displayed question."""
    return " ".join(
        str(market.get(key) or "")
        for key in ("question", "slug", "description", "eventText")
    ).lower()


def _text_token_set(text: str) -> set[str]:
    tokens = re.findall(r"[a-z0-9]{2,}", text.lower())
    normalized: set[str] = set()
    for token in tokens:
        normalized.add(token)
        if len(token) > 3 and token.endswith("s"):
            normalized.add(token[:-1])
    return normalized


def _token_hit(token: str, text: str, tokens: set[str]) -> bool:
    token = token.lower()
    if " " in token:
        return token in text
    return token in tokens


def _market_relevance(market: dict[str, Any], tokens: list[str]) -> tuple[float, list[str]]:
    """Continuous relevance score based on user topic tokens across rich metadata."""
    if not tokens:
        return 0.0, []

    question = (market.get("question") or "").lower()
    slug = (market.get("slug") or "").lower()
    description = (market.get("description") or "").lower()
    event_text = (market.get("eventText") or "").lower()
    rich_text = f"{question} {slug} {description} {event_text}"
    question_tokens = _text_token_set(question)
    slug_tokens = _text_token_set(slug)
    description_tokens = _text_token_set(description)
    event_tokens = _text_token_set(event_text)

    seen: set[str] = set()
    hits: list[str] = []
    score = 0.0
    for token in tokens:
        if token in seen:
            continue
        seen.add(token)
        token_score = 0.0
        if _token_hit(token, question, question_tokens):
            token_score = max(token_score, 1.0)
        if _token_hit(token, slug, slug_tokens):
            token_score = max(token_score, 0.9)
        if _token_hit(token, event_text, event_tokens):
            token_score = max(token_score, 0.8)
        if _token_hit(token, description, description_tokens):
            token_score = max(token_score, 0.6)
        if token_score:
            score += token_score
            hits.append(token)

    # Reward phrase-level agreement without making it a hard allow-list.
    if "fifa" in rich_text and "world" in rich_text and "cup" in rich_text:
        if any(t in tokens for t in {"fifa", "world", "cup"}):
            score += 1.0

    coverage = len(hits) / max(1, len(set(tokens)))
    return round(score + coverage, 3), hits


def _market_quality_rank(market: dict[str, Any]) -> float:
    volume = float(market.get("volume24hr") or 0)
    liquidity = float(market.get("liquidity") or 0)
    quality = float(market.get("quality") or 0)
    # Keep volume/liquidity as tie-breakers after relevance.
    return quality + min(volume / 1_000_000, 2.0) * 0.05 + min(liquidity / 1_000_000, 2.0) * 0.03


def _parse_dt(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _is_general_discovery(user_message: str, tokens: list[str]) -> bool:
    text = user_message.lower()
    if not tokens:
        return True
    if any(phrase in text for phrase in (
        "trending markets",
        "most active",
        "high-volume",
        "high volume",
        "newly created",
        "closing today",
        "ending this week",
        "biggest movers",
        "most liquid",
        "people trading",
        "interesting markets",
        "trading volume",
        "probability is close",
        "close to 50",
        "yes above",
        "yes over",
        "underdog",
        "expiring",
        "next 24 hours",
    )):
        return True
    return all(token in _DISCOVERY_TERMS for token in tokens)


def _apply_smart_filters(user_message: str, markets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    text = user_message.lower()
    filtered = markets

    volume_match = re.search(r"\$?\s*(\d+(?:\.\d+)?)\s*(m|million|k|thousand)?", text)
    if "one million" in text:
        volume_match = None
        threshold = 1_000_000
    else:
        threshold = None
    if "volume" in text and volume_match:
        value = float(volume_match.group(1))
        suffix = volume_match.group(2) or ""
        threshold = value * (1_000_000 if suffix in {"m", "million"} else 1_000 if suffix in {"k", "thousand"} else 1)
    if "volume" in text and threshold is not None:
        filtered = [m for m in filtered if max(float(m.get("volume24hr") or 0), float(m.get("volume") or 0)) >= threshold]

    if "close to 50" in text or "around 50" in text or "near 50" in text:
        filtered = [
            m for m in filtered
            if any(0.45 <= float(price) <= 0.55 for price in (m.get("outcomePrices") or []))
        ]

    yes_match = re.search(r"yes\s+(?:above|over|greater than)\s+(\d+)", text)
    if yes_match:
        threshold = float(yes_match.group(1)) / 100
        filtered = [
            m for m in filtered
            if (m.get("outcomePrices") or [0])[0] >= threshold
        ]

    if "underdog" in text:
        filtered = [
            m for m in filtered
            if any(0.05 <= float(price) <= 0.35 for price in (m.get("outcomePrices") or []))
        ]

    if "next 24 hours" in text or "closing today" in text or "ending today" in text:
        now = datetime.now(UTC)
        cutoff = now + timedelta(hours=24)
        filtered = [
            m for m in filtered
            if (dt := _parse_dt(str(m.get("endDate") or ""))) and now <= dt <= cutoff
        ]
    elif "ending this week" in text or "this week" in text:
        now = datetime.now(UTC)
        cutoff = now + timedelta(days=7)
        filtered = [
            m for m in filtered
            if (dt := _parse_dt(str(m.get("endDate") or ""))) and now <= dt <= cutoff
        ]

    return filtered


def build_match_reason(
    market: dict[str, Any],
    matched_prefs: list[str],
    matched_kw: list[str],
) -> str:
    parts: list[str] = []
    if matched_prefs:
        pref_label = ", ".join(matched_prefs[:3])
        parts.append(f"Matched your Preference: {pref_label}")
    if matched_kw:
        parts.append(f"topic match: {', '.join(matched_kw[:5])}")
    vol = market.get("volume24hr") or 0
    if vol >= 50_000:
        parts.append(f"high 24h volume ({_format_volume(vol)})")
    elif vol > 0:
        parts.append(f"24h volume ({_format_volume(vol)})")
    return "; ".join(parts) if parts else "Matched your saved preferences."


def _keywords_for_pref(pref: dict[str, Any]) -> list[str]:
    blob = f"{pref.get('name', '')} {pref.get('summary', '')}"
    return _tokenize(blob, _PREF_KEYWORD_STOPWORDS)


def _prefs_matching_market(
    market: dict[str, Any],
    prefs: list[dict[str, Any]],
    keywords: list[str],
) -> tuple[list[str], list[str]]:
    """Return (matched pref display names, matched keywords) for strict overlap."""
    question = (market.get("question") or "").lower()
    matched_prefs: list[str] = []
    matched_kw: list[str] = []

    for pref in prefs:
        pref_kws = _keywords_for_pref(pref)
        relevance, hits = _market_relevance(market, pref_kws)
        if hits:
            matched_prefs.append(_pref_display_name(pref))
            for kw in hits:
                if kw not in matched_kw:
                    matched_kw.append(kw)

    # Strict v1: must overlap preference-derived keywords only
    if not matched_kw:
        return [], []

    return matched_prefs, matched_kw


def annotate_market_matches(
    markets: list[dict[str, Any]],
    prefs: list[dict[str, Any]],
    keywords: list[str],
) -> list[MarketCard]:
    """Attach preference match metadata; drop markets with no preference overlap."""
    cards: list[MarketCard] = []
    for market in markets:
        matched_prefs, matched_kw = _prefs_matching_market(market, prefs, keywords)
        if not matched_kw:
            continue

        slug = market.get("slug") or ""
        cards.append(
            MarketCard(
                question=market.get("question") or "",
                slug=slug,
                condition_id=market.get("conditionId") or "",
                outcomes=list(market.get("outcomes") or []),
                outcome_prices=list(market.get("outcomePrices") or []),
                volume24hr=float(market.get("volume24hr") or 0),
                liquidity=float(market.get("liquidity") or 0),
                quality=float(market.get("quality") or 0),
                matched_preferences=matched_prefs,
                matched_keywords=matched_kw,
                match_reason=build_match_reason(market, matched_prefs, matched_kw),
                url=_market_url(slug, str(market.get("eventSlug") or "")),
            )
        )
    return cards


def annotate_query_matches(
    markets: list[dict[str, Any]],
    query_tokens: list[str],
) -> list[MarketCard]:
    """Build cards for markets matched by direct query keywords (no preference required).

    Used as a fallback when the topic isn't in saved preferences, or when
    preference keyword search returns no results (e.g. sports category search
    where match titles don't contain the category word).
    """
    scored_cards: list[tuple[float, MarketCard]] = []
    for market in markets:
        relevance, hits = _market_relevance(market, query_tokens)
        if query_tokens and relevance < 1.0:
            continue

        vol = float(market.get("volume24hr") or 0)
        reason_parts = []
        if hits:
            reason_parts.append(f"matches your topic: {', '.join(hits[:5])}")
        else:
            reason_parts.append("related live market")
        if vol >= 50_000:
            reason_parts.append(f"high 24h volume ({_format_volume(vol)})")
        elif vol > 0:
            reason_parts.append(f"24h volume ({_format_volume(vol)})")

        slug = market.get("slug") or ""
        card = MarketCard(
            question=market.get("question") or "",
            slug=slug,
            condition_id=market.get("conditionId") or "",
            outcomes=list(market.get("outcomes") or []),
            outcome_prices=list(market.get("outcomePrices") or []),
            volume24hr=vol,
            liquidity=float(market.get("liquidity") or 0),
            quality=float(market.get("quality") or 0),
            matched_preferences=[],
            matched_keywords=hits,
            match_reason="; ".join(reason_parts),
            url=_market_url(slug, str(market.get("eventSlug") or "")),
        )
        scored_cards.append((relevance + _market_quality_rank(market), card))

    scored_cards.sort(key=lambda item: item[0], reverse=True)
    return [card for _, card in scored_cards]


def annotate_ranked_matches(
    markets: list[dict[str, Any]],
    *,
    query_tokens: list[str],
    pref_tokens: list[str],
    prefs: list[dict[str, Any]],
) -> list[MarketCard]:
    """Rank Polymarket candidates by query relevance, with preference as a boost.

    This is the main candidate-first path: the markets are already fetched from
    Polymarket, and this function decides which are most relevant to show.
    Query relevance is primary; saved preferences can improve ranking and
    explanation, but they do not block query results.
    """
    scored_cards: list[tuple[float, MarketCard]] = []
    for market in markets:
        query_score, query_hits = _market_relevance(market, query_tokens)
        pref_score, pref_hits = _market_relevance(market, pref_tokens)

        if query_tokens and query_score < 1.0 and pref_score < 1.0:
            continue
        if not query_tokens and pref_tokens and pref_score < 1.0:
            continue

        matched_prefs: list[str] = []
        if pref_hits:
            for pref in prefs:
                pref_score_for_node, _ = _market_relevance(market, _keywords_for_pref(pref))
                if pref_score_for_node >= 1.0:
                    matched_prefs.append(_pref_display_name(pref))

        vol = float(market.get("volume24hr") or 0)
        reason_parts: list[str] = []
        if query_hits:
            reason_parts.append(f"matches your topic: {', '.join(query_hits[:5])}")
        if matched_prefs:
            reason_parts.append(f"matches saved preference: {', '.join(matched_prefs[:2])}")
        if vol >= 50_000:
            reason_parts.append(f"high 24h volume ({_format_volume(vol)})")
        elif vol > 0:
            reason_parts.append(f"24h volume ({_format_volume(vol)})")
        if not reason_parts:
            reason_parts.append("relevant live market")

        slug = market.get("slug") or ""
        card = MarketCard(
            question=market.get("question") or "",
            slug=slug,
            condition_id=market.get("conditionId") or "",
            outcomes=list(market.get("outcomes") or []),
            outcome_prices=list(market.get("outcomePrices") or []),
            volume24hr=vol,
            liquidity=float(market.get("liquidity") or 0),
            quality=float(market.get("quality") or 0),
            matched_preferences=matched_prefs,
            matched_keywords=query_hits or pref_hits,
            match_reason="; ".join(reason_parts),
            url=_market_url(slug, str(market.get("eventSlug") or "")),
        )

        score = (query_score * 4.0) + (pref_score * 1.25) + _market_quality_rank(market)
        scored_cards.append((score, card))

    scored_cards.sort(key=lambda item: item[0], reverse=True)
    return [card for _, card in scored_cards]


def annotate_discovery_matches(
    markets: list[dict[str, Any]],
    reason: str,
) -> list[MarketCard]:
    cards: list[MarketCard] = []
    for market in markets:
        vol = float(market.get("volume24hr") or 0)
        slug = market.get("slug") or ""
        reason_parts = [reason]
        if vol >= 50_000:
            reason_parts.append(f"high 24h volume ({_format_volume(vol)})")
        elif vol > 0:
            reason_parts.append(f"24h volume ({_format_volume(vol)})")
        cards.append(
            MarketCard(
                question=market.get("question") or "",
                slug=slug,
                condition_id=market.get("conditionId") or "",
                outcomes=list(market.get("outcomes") or []),
                outcome_prices=list(market.get("outcomePrices") or []),
                volume24hr=vol,
                liquidity=float(market.get("liquidity") or 0),
                quality=float(market.get("quality") or 0),
                matched_preferences=[],
                matched_keywords=[],
                match_reason="; ".join(reason_parts),
                url=_market_url(slug, str(market.get("eventSlug") or "")),
            )
        )
    return cards


def build_lookup_reply(markets: list[MarketCard]) -> str:
    n = len(markets)
    has_pref = any(m.matched_preferences for m in markets)
    label = "your saved preferences" if has_pref else "your search"
    if n == 0:
        return _NO_MATCH_REPLY
    if n == 1:
        return f"Here is 1 Polymarket market matching {label}."
    return f"Here are {n} Polymarket markets matching {label}."


_QUERY_PLAN_PROMPT = """\
Convert a user message into a Polymarket search plan.

Return ONLY valid JSON with this shape:
{
  "intent": "market_lookup" | "discovery",
  "search_terms": ["..."],
  "filters": {
    "probability": {"min": 0-100, "max": 0-100},
    "probability_above": 0-100,
    "probability_below": 0-100,
    "end_within_hours": number,
    "volume_min_usd": number,
    "liquidity_min_usd": number
  },
  "sort": "relevance" | "volume" | "liquidity" | "newest" | "ending_soon"
}

Rules:
- Do NOT return market names or IDs.
- search_terms should be 1-4 compact query strings for Gamma /public-search.
- Use discovery intent only for broad discovery requests (trending, most active, newest, ending soon).
- Keep filters empty if not requested by the user.
- For "close to 50%" style requests set probability min/max (for example 45..55).
"""


def _extract_json_object(text: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def _coerce_number(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalize_query_plan(data: dict[str, Any] | None) -> QueryPlan:
    if not data:
        return QueryPlan()

    intent = str(data.get("intent") or "market_lookup").strip().lower()
    if intent not in {"market_lookup", "discovery"}:
        intent = "market_lookup"

    raw_terms = data.get("search_terms")
    terms: list[str] = []
    if isinstance(raw_terms, list):
        for term in raw_terms:
            text = str(term or "").strip()
            if text and text.lower() not in {t.lower() for t in terms}:
                terms.append(text)
    elif isinstance(raw_terms, str) and raw_terms.strip():
        terms.append(raw_terms.strip())

    raw_filters = data.get("filters")
    filters = raw_filters if isinstance(raw_filters, dict) else {}

    sort = str(data.get("sort") or "relevance").strip().lower()
    if sort not in {"relevance", "volume", "liquidity", "newest", "ending_soon"}:
        sort = "relevance"

    return QueryPlan(intent=intent, search_terms=terms[:4], filters=filters, sort=sort)


def _fallback_query_plan(user_message: str) -> QueryPlan:
    query_tokens = _query_topic_tokens(user_message)
    joined = " ".join(query_tokens[:4]).strip()
    search_terms = [joined] if joined else []
    return QueryPlan(
        intent="discovery" if _is_general_discovery(user_message, query_tokens) else "market_lookup",
        search_terms=search_terms,
        filters={},
        sort="relevance",
    )


def _plan_query(user_message: str, settings: Settings | None) -> QueryPlan:
    if settings is None:
        return _fallback_query_plan(user_message)
    try:
        response = generate_reply(
            settings,
            system_prompt=_QUERY_PLAN_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        planned = _normalize_query_plan(_extract_json_object(response))
        if planned.search_terms:
            return planned
    except Exception as exc:  # noqa: BLE001
        logger.warning("query planner failed: %s", exc)
    return _fallback_query_plan(user_message)


def _apply_plan_filters(plan: QueryPlan, markets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    filtered = list(markets)
    f = plan.filters

    probability = f.get("probability") if isinstance(f, dict) else None
    if isinstance(probability, dict):
        min_pct = _coerce_number(probability.get("min"))
        max_pct = _coerce_number(probability.get("max"))
        if min_pct is not None and max_pct is not None:
            lo, hi = min(min_pct, max_pct) / 100.0, max(min_pct, max_pct) / 100.0
            filtered = [m for m in filtered if any(lo <= float(p) <= hi for p in (m.get("outcomePrices") or []))]

    prob_above = _coerce_number(f.get("probability_above") if isinstance(f, dict) else None)
    if prob_above is not None:
        threshold = prob_above / 100.0
        filtered = [m for m in filtered if any(float(p) >= threshold for p in (m.get("outcomePrices") or []))]

    prob_below = _coerce_number(f.get("probability_below") if isinstance(f, dict) else None)
    if prob_below is not None:
        threshold = prob_below / 100.0
        filtered = [m for m in filtered if any(float(p) <= threshold for p in (m.get("outcomePrices") or []))]

    end_within = _coerce_number(f.get("end_within_hours") if isinstance(f, dict) else None)
    if end_within is not None and end_within > 0:
        now = datetime.now(UTC)
        cutoff = now + timedelta(hours=end_within)
        filtered = [
            m for m in filtered
            if (dt := _parse_dt(str(m.get("endDate") or ""))) and now <= dt <= cutoff
        ]

    volume_min = _coerce_number(f.get("volume_min_usd") if isinstance(f, dict) else None)
    if volume_min is not None and volume_min > 0:
        filtered = [m for m in filtered if float(m.get("volume24hr") or 0) >= volume_min]

    liq_min = _coerce_number(f.get("liquidity_min_usd") if isinstance(f, dict) else None)
    if liq_min is not None and liq_min > 0:
        filtered = [m for m in filtered if float(m.get("liquidity") or 0) >= liq_min]

    return filtered


def _sort_raw_markets(plan: QueryPlan, markets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if plan.sort == "volume":
        return sorted(markets, key=lambda m: float(m.get("volume24hr") or 0), reverse=True)
    if plan.sort == "liquidity":
        return sorted(markets, key=lambda m: float(m.get("liquidity") or 0), reverse=True)
    if plan.sort == "newest":
        return sorted(markets, key=lambda m: str(m.get("createdAt") or ""), reverse=True)
    if plan.sort == "ending_soon":
        return sorted(
            markets,
            key=lambda m: _parse_dt(str(m.get("endDate") or "")) or datetime.max.replace(tzinfo=UTC),
        )
    return markets


def _dedupe_markets(markets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_key: dict[str, dict[str, Any]] = {}
    for market in markets:
        key = (
            str(market.get("conditionId") or "").strip()
            or str(market.get("id") or "").strip()
            or str(market.get("slug") or "").strip()
        )
        if key:
            by_key[key] = market
    return list(by_key.values())


def _query_topic_tokens(user_message: str) -> list[str]:
    """Extract real topic words from a user message, stripping action/generic words."""
    base_tokens = [
        t for t in re.findall(r"[a-z0-9]{2,}", user_message.lower())
        if t not in _QUERY_FILTER_STOPWORDS
    ]
    seen: set[str] = set()
    expanded: list[str] = []
    for token in base_tokens:
        for candidate in (token, *_QUERY_EXPANSIONS.get(token, ())):
            if candidate not in seen:
                seen.add(candidate)
                expanded.append(candidate)
    return expanded


def _terms_topic_tokens(search_terms: list[str]) -> list[str]:
    seen: set[str] = set()
    expanded: list[str] = []
    for term in search_terms:
        for token in _query_topic_tokens(term):
            if token not in seen:
                seen.add(token)
                expanded.append(token)
    return expanded


async def lookup_markets_for_user(
    zep: Zep,
    user_id: str,
    user_message: str,
    *,
    settings: Settings | None = None,
    limit: int = 8,
) -> MarketLookupResult:
    """Search/discover Polymarket markets with local filtering + ranking."""
    prefs = get_preference_nodes(zep, user_id)
    plan = _plan_query(user_message, settings)
    query_tokens = _query_topic_tokens(user_message)
    for token in _terms_topic_tokens(plan.search_terms):
        if token not in query_tokens:
            query_tokens.append(token)

    if plan.intent == "discovery" or _is_general_discovery(user_message, query_tokens):
        order = "createdAt" if "new" in user_message.lower() or "created" in user_message.lower() else "volume24hr"
        ascending = "closing" in user_message.lower() or "ending" in user_message.lower()
        if ascending:
            order = "endDate"
        try:
            discovery_markets = await list_markets(
                limit=200,
                order=order,
                ascending=ascending,
                min_volume_24h=0,
                min_liquidity=0,
            )
            discovery_markets = _apply_smart_filters(user_message, discovery_markets)
            discovery_markets = _apply_plan_filters(plan, discovery_markets)
            discovery_markets.sort(
                key=lambda m: (
                    float(m.get("volume24hr") or 0),
                    float(m.get("liquidity") or 0),
                    float(m.get("quality") or 0),
                ),
                reverse=not ascending,
            )
            cards = annotate_discovery_matches(discovery_markets[:limit], "selected from live Polymarket activity")
            if cards:
                return MarketLookupResult(reply=build_lookup_reply(cards), markets=cards, status="ok")
        except Exception as exc:  # noqa: BLE001
            logger.warning("market_lookup discovery failed: %s", exc)

    # Preferences are a ranking boost, not a hard filter.
    scoped_prefs = filter_prefs_by_query(prefs, user_message) if prefs and query_tokens else prefs
    pref_keywords = preference_keywords(scoped_prefs) if scoped_prefs else []
    fallback_term = " ".join(query_tokens[:4]).strip()
    search_terms = [term for term in plan.search_terms if term.strip()]
    if not search_terms and fallback_term:
        search_terms = [fallback_term]

    logger.info(
        "market_lookup user=%s intent=%s terms=%s query_tokens=%s",
        user_id, plan.intent, search_terms[:4], query_tokens[:10],
    )

    raw_markets: list[dict[str, Any]] = []
    if search_terms:
        for term in search_terms:
            try:
                raw_markets.extend(
                    await search_public_markets(
                        term,
                        limit=120,
                        min_volume_24h=0,
                        min_liquidity=0,
                    )
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("market_lookup public-search failed term=%r err=%s", term, exc)
    raw_markets = _dedupe_markets(raw_markets)

    # Fallback retrieval when /public-search is sparse.
    if not raw_markets:
        fallback_keywords = query_tokens + pref_keywords
        if fallback_keywords:
            try:
                raw_markets = await search_markets(
                    fallback_keywords,
                    limit=200,
                    min_volume_24h=0,
                    min_liquidity=0,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("market_lookup fallback search failed: %s", exc)
                raw_markets = []
        if not raw_markets:
            raw_markets = await list_markets(limit=200, min_volume_24h=0, min_liquidity=0)

    raw_markets = _apply_plan_filters(plan, raw_markets)
    raw_markets = _apply_smart_filters(user_message, raw_markets)
    raw_markets = _sort_raw_markets(plan, raw_markets)

    cards = annotate_ranked_matches(
        raw_markets,
        query_tokens=query_tokens,
        pref_tokens=pref_keywords,
        prefs=scoped_prefs,
    )
    logger.info("market_lookup user=%s candidates=%d cards=%d", user_id, len(raw_markets), len(cards))

    if not cards:
        return MarketLookupResult(reply=_NO_MATCH_REPLY, markets=[], status="no_matches")

    return MarketLookupResult(
        reply=build_lookup_reply(cards[:limit]),
        markets=cards[:limit],
        status="ok",
    )
