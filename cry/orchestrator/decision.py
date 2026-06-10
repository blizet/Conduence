"""Decision engine — turns signals into trade suggestions with few assumptions.

Philosophy: a single signal is never enough. A suggestion is emitted
only when the correlation graph links the signal to a tradeable asset
AND at least one independent confirmation exists (a corroborating
signal from a different agent type, or a price move agreeing with the
predicted direction). Divergence flags REDUCE confidence — when an
asset is decoupled from the graph, we trust the graph less, not more.

Confidence model (all terms bounded, final clamped to [0, 1]):
  0.40 * |graph impact|          how strongly the graph links event -> asset
+ 0.20 * signal strength         how loud the originating signal is
+ 0.25 * corroboration           other agent types agreeing (capped)
+ 0.15 * price confirmation      CoinGecko 24h move agrees with direction
- 0.30 * divergence caution      asset currently decoupled from graph
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from graph.graph import CorrelationGraph, Impact
from tools.base import ToolRegistry

CORROBORATION_WINDOW_S = 30 * 60
MIN_PRICE_CONFIRM_PCT = 1.0   # 24h move must exceed this to count as confirmation

# entry sanity (strategy: no edge left at extremes, junk tails below)
ENTRY_MAX = 0.92
ENTRY_MIN = 0.05
MIN_MARKET_QUALITY = 0.30

# position sizing (strategy sect. 11: 2-5% of portfolio per trade,
# capped so the position is a small fraction of the book)
SIZE_PCT_MIN = 0.02
SIZE_PCT_MAX = 0.05
MAX_LIQUIDITY_FRACTION = 0.05
HEDGE_MIN_CORR = 0.7
HEDGE_RATIO = 0.5             # strategy sect. 11: hedge 50-100% of position


@dataclass
class TradeSuggestion:
    market: str
    slug: str
    side: str                 # "BUY YES" | "BUY NO"
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

    def to_dict(self) -> dict:
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


class DecisionEngine:
    def __init__(
        self,
        graph: CorrelationGraph,
        tools: ToolRegistry,
        min_confidence: float = 0.55,
        portfolio_usd: float = 10_000.0,
    ):
        self.graph = graph
        self.tools = tools
        self.min_confidence = min_confidence
        self.portfolio_usd = portfolio_usd
        self._recent: list[dict] = []          # rolling signal memory
        self._diverging: dict[str, float] = {}  # node_id -> last divergence ts

    # ------------------------------------------------------------------
    def remember(self, signal: dict) -> None:
        now = time.time()
        self._recent.append({**signal, "_at": now})
        self._recent = [s for s in self._recent if now - s["_at"] < CORROBORATION_WINDOW_S]
        if signal.get("type") == "divergence":
            for node_id in signal.get("keywords", []):
                if node_id in self.graph.nodes:
                    self._diverging[node_id] = now

    def _is_diverging(self, node_id: str) -> bool:
        at = self._diverging.get(node_id)
        return at is not None and time.time() - at < CORROBORATION_WINDOW_S

    def _corroboration(self, signal: dict, node_id: str, predicted_sign: float) -> tuple[float, list[str]]:
        """Other agent types pointing at the same node, same direction."""
        score, notes = 0.0, []
        for past in self._recent:
            if past.get("agent") == signal.get("agent"):
                continue
            past_nodes = {n.id for n in self.graph.match_keywords(past.get("keywords", []))}
            if node_id not in past_nodes:
                continue
            past_sign = 1.0 if past.get("direction") == "bullish" else -1.0 if past.get("direction") == "bearish" else 0.0
            if past_sign == 0.0:
                continue
            if past_sign * predicted_sign > 0:
                score += 0.5
                notes.append(f"corroborated by {past.get('agent')}: {past.get('summary', past.get('headline', ''))[:120]}")
            else:
                score -= 0.25
                notes.append(f"CONTRADICTED by {past.get('agent')}: {past.get('summary', past.get('headline', ''))[:120]}")
        return max(-0.5, min(1.0, score)), notes

    def _price_confirmation(self, node_id: str, predicted_sign: float) -> tuple[float, str | None]:
        node = self.graph.nodes.get(node_id)
        if not node or not node.coingecko_id:
            return 0.0, None
        prices = self.tools.get("coingecko_price").call(ids=[node.coingecko_id])
        info = prices.get(node.coingecko_id)
        if not info:
            return 0.0, None
        chg = info.get("usd_24h_change", 0.0) or 0.0
        if abs(chg) < MIN_PRICE_CONFIRM_PCT:
            return 0.0, None
        agrees = (chg > 0) == (predicted_sign > 0)
        note = f"price check: {node.label} 24h {chg:+.1f}% ({'agrees' if agrees else 'disagrees'})"
        return (1.0 if agrees else -0.5), note

    # ------------------------------------------------------------------
    def decide(self, signal: dict) -> list[TradeSuggestion]:
        """Main entry: one inbound signal -> zero or more suggestions."""
        self.remember(signal)
        if signal.get("type") == "divergence":
            # divergence informs confidence; it is context, not a trade trigger
            return []

        sign = 1.0 if signal.get("direction", signal.get("sentiment")) == "bullish" else \
               -1.0 if signal.get("direction", signal.get("sentiment")) == "bearish" else 0.0
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
                if node.type != "asset" and node.type != "theme":
                    continue
                if node.id in seen_assets:
                    continue
                seen_assets.add(node.id)
                suggestion = self._evaluate_node(signal, impact, strength)
                if suggestion:
                    suggestions.append(suggestion)

        suggestions.sort(key=lambda s: -s.confidence)
        return suggestions[:3]

    @staticmethod
    def _entry_price(market: dict, predicted_sign: float) -> float | None:
        """Executable entry: ask for YES, 1-bid for NO; mid as fallback."""
        bid, ask = market.get("bestBid"), market.get("bestAsk")
        if bid and ask:
            return ask if predicted_sign > 0 else round(1.0 - bid, 4)
        prices = market.get("outcomePrices") or []
        if len(prices) >= 2:
            return prices[0] if predicted_sign > 0 else prices[1]
        return None

    def _position_size(self, confidence: float, market: dict) -> float:
        """2-5%% of portfolio scaled by conviction, capped by book depth."""
        conviction = (confidence - self.min_confidence) / max(1e-9, 1.0 - self.min_confidence)
        pct = SIZE_PCT_MIN + (SIZE_PCT_MAX - SIZE_PCT_MIN) * max(0.0, min(1.0, conviction))
        by_portfolio = self.portfolio_usd * pct
        by_liquidity = market.get("liquidity", 0.0) * MAX_LIQUIDITY_FRACTION
        return round(min(by_portfolio, by_liquidity), 0)

    def _find_hedge(self, node_id: str, predicted_sign: float, main_size: float, exclude_slug: str = "") -> dict | None:
        """Correlated hedge (strategy sect. 4/11): take the opposite side of
        the strongest-correlated asset's market. Positive corr -> opposite
        side; negative corr -> same side."""
        for neighbor, weight, _why in self.graph.neighbors(node_id, min_abs_weight=HEDGE_MIN_CORR):
            if neighbor.type != "asset":
                continue
            markets = self.tools.get("polymarket_gamma").call(keywords=neighbor.keywords or [neighbor.id], limit=1)["markets"]
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

    def _evaluate_node(self, signal: dict, impact: Impact, strength: float) -> TradeSuggestion | None:
        node = impact.node
        predicted_sign = 1.0 if impact.score > 0 else -1.0
        evidence = [
            f"{signal.get('agent', signal.get('type'))}: {signal.get('summary', signal.get('headline', ''))[:140]}",
            f"graph: {' -> '.join(impact.path)} (impact {impact.score:+.2f}; {impact.rationale})",
        ]
        confirmations = 0

        corr_score, corr_notes = self._corroboration(signal, node.id, predicted_sign)
        evidence += corr_notes
        if corr_score > 0:
            confirmations += 1

        price_score, price_note = self._price_confirmation(node.id, predicted_sign)
        if price_note:
            evidence.append(price_note)
        if price_score > 0:
            confirmations += 1

        caution = 0.0
        if self._is_diverging(node.id):
            caution = 1.0
            evidence.append(f"caution: {node.label} currently diverging from graph correlations — confidence reduced")

        confidence = (
            0.40 * abs(impact.score)
            + 0.20 * strength
            + 0.25 * max(0.0, corr_score)
            + 0.15 * max(0.0, price_score)
            - 0.30 * caution
            + min(0.0, corr_score) * 0.25      # contradictions subtract
            + min(0.0, price_score) * 0.15
        )
        confidence = max(0.0, min(1.0, confidence))

        # low-assumption gate 1: graph link + at least one independent confirmation
        if confidence < self.min_confidence or confirmations < 1:
            return None

        # gamma tool already gates volume/liquidity/spread and ranks by quality
        markets = self.tools.get("polymarket_gamma").call(keywords=node.keywords or [node.id])["markets"]
        if not markets:
            return None
        market = markets[0]

        quality = market.get("quality", 0.0)
        if quality < MIN_MARKET_QUALITY:
            return None
        # marginal markets shave confidence (thin book = worse fills + exits)
        confidence = round(confidence * (0.85 + 0.15 * quality), 3)
        if confidence < self.min_confidence:
            return None

        entry = self._entry_price(market, predicted_sign)
        # gate 2: entry sanity — no payoff left near 1.0, junk tail near 0
        if entry is not None and not (ENTRY_MIN <= entry <= ENTRY_MAX):
            return None

        spread_txt = f"{market['spread'] * 100:.1f}%" if market.get("spread") is not None else "n/a"
        evidence.append(
            f"market quality {quality:.2f}: vol24h ${market['volume24hr']:,.0f}, "
            f"liquidity ${market['liquidity']:,.0f}, spread {spread_txt}"
        )

        size = self._position_size(confidence, market)
        hedge = self._find_hedge(node.id, predicted_sign, size, exclude_slug=market.get("slug", ""))
        if hedge:
            evidence.append(f"hedge: {hedge['side']} \"{hedge['market'][:70]}\" ${hedge['size_usd']:,.0f} ({hedge['via']})")

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
