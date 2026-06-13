"""Decision engine — ported from cry/orchestrator/decision.py (tool_results-aware)."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from app.orchestrator.correlation_graph import CorrelationGraph, Impact

CORROBORATION_WINDOW_S = 30 * 60
MIN_PRICE_CONFIRM_PCT = 1.0
ENTRY_MAX = 0.92
ENTRY_MIN = 0.05
MIN_MARKET_QUALITY = 0.30
SIZE_PCT_MIN = 0.02
SIZE_PCT_MAX = 0.05
MAX_LIQUIDITY_FRACTION = 0.05
HEDGE_MIN_CORR = 0.7
HEDGE_RATIO = 0.5


@dataclass
class TradeSuggestion:
    market: str
    slug: str
    side: str
    entry_price: float | None
    confidence: float
    asset: str
    thesis: str
    graph_path: list[str]
    evidence: list[str] = field(default_factory=list)
    suggested_size_usd: float | None = None
    market_quality: float | None = None
    hedge: dict | None = None
    ts: float = field(default_factory=time.time)

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": "trade_suggestion",
            "market": self.market,
            "slug": self.slug,
            "side": self.side,
            "entry_price": self.entry_price,
            "confidence": round(self.confidence, 3),
            "asset": self.asset,
            "thesis": self.thesis,
            "graph_path": self.graph_path,
            "evidence": self.evidence,
            "suggested_size_usd": self.suggested_size_usd,
            "market_quality": self.market_quality,
            "hedge": self.hedge,
            "ts": self.ts,
        }


def _signal_sign(signal: dict[str, Any]) -> float:
    direction = signal.get("direction", signal.get("sentiment"))
    if direction == "bullish":
        return 1.0
    if direction == "bearish":
        return -1.0
    return 0.0


def _gamma_markets(tool_results: dict[str, Any], keywords: list[str]) -> list[dict[str, Any]]:
    gamma = tool_results.get("polymarketGamma") or {}
    if gamma.get("ok") and gamma.get("data", {}).get("markets"):
        return gamma["data"]["markets"]
    keyed = tool_results.get(f"polymarketGamma:{','.join(keywords)}") or {}
    if keyed.get("ok") and keyed.get("data", {}).get("markets"):
        return keyed["data"]["markets"]
    return []


def _coingecko_prices(tool_results: dict[str, Any]) -> dict[str, Any]:
    cg = tool_results.get("coingecko") or {}
    if cg.get("ok"):
        return cg.get("data", {}).get("prices", {})
    return {}


class DecisionEngine:
    def __init__(
        self,
        graph: CorrelationGraph,
        min_confidence: float = 0.55,
        portfolio_usd: float = 10_000.0,
    ):
        self.graph = graph
        self.min_confidence = min_confidence
        self.portfolio_usd = portfolio_usd

    def remember(self, recent: list[dict[str, Any]], signal: dict[str, Any]) -> list[dict[str, Any]]:
        now = time.time()
        updated = [{**signal, "_at": now}, *recent]
        return [s for s in updated if now - s.get("_at", now) < CORROBORATION_WINDOW_S]

    def _corroboration(
        self,
        signal: dict[str, Any],
        recent: list[dict[str, Any]],
        node_id: str,
        predicted_sign: float,
    ) -> tuple[float, list[str]]:
        score, notes = 0.0, []
        for past in recent:
            if past.get("agent") == signal.get("agent"):
                continue
            past_nodes = {n.id for n in self.graph.match_keywords(past.get("keywords", []))}
            if node_id not in past_nodes:
                continue
            past_sign = _signal_sign(past)
            if past_sign == 0.0:
                continue
            summary = past.get("summary", past.get("headline", ""))[:120]
            if past_sign * predicted_sign > 0:
                score += 0.5
                notes.append(f"corroborated by {past.get('agent')}: {summary}")
            else:
                score -= 0.25
                notes.append(f"CONTRADICTED by {past.get('agent')}: {summary}")
        return max(-0.5, min(1.0, score)), notes

    def _price_confirmation(
        self,
        tool_results: dict[str, Any],
        node_id: str,
        predicted_sign: float,
    ) -> tuple[float, str | None]:
        node = self.graph.nodes.get(node_id)
        if not node or not node.coingecko_id:
            return 0.0, None
        prices = _coingecko_prices(tool_results)
        info = prices.get(node.coingecko_id)
        if not info:
            return 0.0, None
        chg = info.get("usd_24h_change", 0.0) or 0.0
        if abs(chg) < MIN_PRICE_CONFIRM_PCT:
            return 0.0, None
        agrees = (chg > 0) == (predicted_sign > 0)
        note = f"price check: {node.label} 24h {chg:+.1f}% ({'agrees' if agrees else 'disagrees'})"
        return (1.0 if agrees else -0.5), note

    def decide(
        self,
        signal: dict[str, Any],
        recent_signals: list[dict[str, Any]],
        tool_results: dict[str, Any],
    ) -> list[dict[str, Any]]:
        sign = _signal_sign(signal)
        if sign == 0.0:
            return []

        text = " ".join(signal.get("keywords", [])) + " " + signal.get("summary", signal.get("headline", ""))
        origins = self.graph.match_keywords(text)
        if not origins:
            return []

        strength = float(signal.get("strength", 0.6))
        suggestions: list[TradeSuggestion] = []
        seen_assets: set[str] = set()

        for origin in origins:
            for impact in self.graph.propagate(origin.id, strength=sign):
                node = impact.node
                if node.type not in ("asset", "theme"):
                    continue
                if node.id in seen_assets:
                    continue
                seen_assets.add(node.id)
                suggestion = self._evaluate_node(
                    signal,
                    impact,
                    strength,
                    recent_signals,
                    tool_results,
                )
                if suggestion:
                    suggestions.append(suggestion)

        suggestions.sort(key=lambda s: -s.confidence)
        return [s.to_dict() for s in suggestions[:3]]

    @staticmethod
    def _entry_price(market: dict[str, Any], predicted_sign: float) -> float | None:
        bid, ask = market.get("bestBid"), market.get("bestAsk")
        if bid and ask:
            return ask if predicted_sign > 0 else round(1.0 - bid, 4)
        prices = market.get("outcomePrices") or []
        if len(prices) >= 2:
            return prices[0] if predicted_sign > 0 else prices[1]
        return None

    def _position_size(self, confidence: float, market: dict[str, Any]) -> float:
        conviction = (confidence - self.min_confidence) / max(1e-9, 1.0 - self.min_confidence)
        pct = SIZE_PCT_MIN + (SIZE_PCT_MAX - SIZE_PCT_MIN) * max(0.0, min(1.0, conviction))
        by_portfolio = self.portfolio_usd * pct
        by_liquidity = market.get("liquidity", 0.0) * MAX_LIQUIDITY_FRACTION
        return round(min(by_portfolio, by_liquidity), 0)

    def _find_hedge(
        self,
        tool_results: dict[str, Any],
        node_id: str,
        predicted_sign: float,
        main_size: float,
        exclude_slug: str = "",
    ) -> dict | None:
        for neighbor, weight, _why in self.graph.neighbors(node_id, min_abs_weight=HEDGE_MIN_CORR):
            if neighbor.type != "asset":
                continue
            keywords = neighbor.keywords or [neighbor.id]
            markets = _gamma_markets(tool_results, keywords)
            markets = [m for m in markets if m.get("slug") != exclude_slug]
            if not markets:
                continue
            market = markets[0]
            hedge_sign = -predicted_sign if weight > 0 else predicted_sign
            return {
                "market": market["question"],
                "slug": market.get("slug", ""),
                "side": "BUY YES" if hedge_sign > 0 else "BUY NO",
                "size_usd": round(main_size * HEDGE_RATIO, 0),
                "via": f"{node_id} <-> {neighbor.id} (corr {weight:+.2f})",
            }
        return None

    def _evaluate_node(
        self,
        signal: dict[str, Any],
        impact: Impact,
        strength: float,
        recent_signals: list[dict[str, Any]],
        tool_results: dict[str, Any],
    ) -> TradeSuggestion | None:
        node = impact.node
        predicted_sign = 1.0 if impact.score > 0 else -1.0
        evidence = [
            f"{signal.get('agent', signal.get('type'))}: "
            f"{signal.get('summary', signal.get('headline', ''))[:140]}",
            f"graph: {' -> '.join(impact.path)} (impact {impact.score:+.2f}; {impact.rationale})",
        ]
        confirmations = 0

        corr_score, corr_notes = self._corroboration(signal, recent_signals, node.id, predicted_sign)
        evidence += corr_notes
        if corr_score > 0:
            confirmations += 1

        price_score, price_note = self._price_confirmation(tool_results, node.id, predicted_sign)
        if price_note:
            evidence.append(price_note)
        if price_score > 0:
            confirmations += 1

        confidence = (
            0.40 * abs(impact.score)
            + 0.20 * strength
            + 0.25 * max(0.0, corr_score)
            + 0.15 * max(0.0, price_score)
            + min(0.0, corr_score) * 0.25
            + min(0.0, price_score) * 0.15
        )
        confidence = max(0.0, min(1.0, confidence))

        if confidence < self.min_confidence or confirmations < 1:
            return None

        keywords = node.keywords or [node.id]
        markets = _gamma_markets(tool_results, keywords)
        if not markets:
            return None
        market = markets[0]

        quality = market.get("quality", 0.0)
        if quality < MIN_MARKET_QUALITY:
            return None
        confidence = round(confidence * (0.85 + 0.15 * quality), 3)
        if confidence < self.min_confidence:
            return None

        entry = self._entry_price(market, predicted_sign)
        if entry is not None and not (ENTRY_MIN <= entry <= ENTRY_MAX):
            return None

        spread_txt = f"{market['spread'] * 100:.1f}%" if market.get("spread") is not None else "n/a"
        evidence.append(
            f"market quality {quality:.2f}: vol24h ${market['volume24hr']:,.0f}, "
            f"liquidity ${market['liquidity']:,.0f}, spread {spread_txt}"
        )

        size = self._position_size(confidence, market)
        hedge = self._find_hedge(tool_results, node.id, predicted_sign, size, exclude_slug=market.get("slug", ""))
        if hedge:
            evidence.append(
                f"hedge: {hedge['side']} \"{hedge['market'][:70]}\" ${hedge['size_usd']:,.0f} ({hedge['via']})"
            )

        side = "BUY YES" if predicted_sign > 0 else "BUY NO"
        direction_word = "up" if predicted_sign > 0 else "down"
        thesis = (
            f"{signal.get('summary', signal.get('headline', 'signal'))[:120]} | graph says {node.label} "
            f"moves {direction_word} (impact {impact.score:+.2f} via {' -> '.join(impact.path)})"
        )
        return TradeSuggestion(
            market=market["question"],
            slug=market.get("slug", ""),
            side=side,
            entry_price=entry,
            confidence=confidence,
            asset=node.id,
            thesis=thesis,
            graph_path=impact.path,
            evidence=evidence,
            suggested_size_usd=size,
            market_quality=quality,
            hedge=hedge,
        )
