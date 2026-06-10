"""Polymarket Gamma API tool — market discovery by keyword.

Markets are gated and ranked by a quality scorecard following the
strategy doc (CRYPTO_TRADING_STRATEGY.md sect. 3 + 7):

- hard gates: volume24h >= $10K (red flag below), liquidity >= $10K,
  bid-ask spread <= 5% (illiquid above)
- quality score (0..1):
    0.40 * volume score     sweet spot $50K-$500K daily volume
    0.35 * spread score     <=2% ideal, scaled to 0 at 5%
    0.25 * liquidity score  saturates at $50K
"""

from __future__ import annotations

import json
import time

from .base import Tool, http_get_json

GAMMA_URL = "https://gamma-api.polymarket.com/markets"
CATALOG_TTL_S = 30.0  # one catalog fetch serves all keyword searches for 30s

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

_SIM_MARKETS = [
    {
        "question": "Will Bitcoin hit $120,000 by July 31?",
        "slug": "bitcoin-120k-july",
        "outcomes": ["Yes", "No"],
        "outcomePrices": [0.42, 0.58],
        "bestBid": 0.41, "bestAsk": 0.43,
        "volume24hr": 310_000,
        "liquidity": 95_000,
        "keywords": ["bitcoin", "btc"],
    },
    {
        "question": "Will Ethereum trade above $6,000 this month?",
        "slug": "ethereum-6k-month",
        "outcomes": ["Yes", "No"],
        "outcomePrices": [0.35, 0.65],
        "bestBid": 0.34, "bestAsk": 0.36,
        "volume24hr": 180_000,
        "liquidity": 60_000,
        "keywords": ["ethereum", "eth"],
    },
    {
        "question": "Will an altcoin enter the top-5 by market cap this quarter?",
        "slug": "altcoin-top5-quarter",
        "outcomes": ["Yes", "No"],
        "outcomePrices": [0.18, 0.82],
        "bestBid": 0.17, "bestAsk": 0.20,
        "volume24hr": 75_000,
        "liquidity": 30_000,
        "keywords": ["altcoin", "altcoins", "solana", "xrp"],
    },
    {
        "question": "Will the Fed cut rates at the next FOMC meeting?",
        "slug": "fed-cut-next-fomc",
        "outcomes": ["Yes", "No"],
        "outcomePrices": [0.61, 0.39],
        "bestBid": 0.60, "bestAsk": 0.61,
        "volume24hr": 540_000,
        "liquidity": 210_000,
        "keywords": ["fed", "fomc", "rate cut", "rate hike"],
    },
    {
        # deliberately marginal: thin book, wide spread -> low quality score
        "question": "Will Zcash close above $80 this week?",
        "slug": "zcash-80-week",
        "outcomes": ["Yes", "No"],
        "outcomePrices": [0.27, 0.73],
        "bestBid": 0.25, "bestAsk": 0.29,
        "volume24hr": 22_000,
        "liquidity": 12_000,
        "keywords": ["zcash", "zec", "privacy coin"],
    },
    {
        "question": "Will Trump sign a crypto executive order this month?",
        "slug": "trump-crypto-eo-month",
        "outcomes": ["Yes", "No"],
        "outcomePrices": [0.55, 0.45],
        "bestBid": 0.54, "bestAsk": 0.56,
        "volume24hr": 410_000,
        "liquidity": 150_000,
        "keywords": ["trump", "executive order", "white house"],
    },
]


def _parse_market(m: dict) -> dict | None:
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
        "outcomes": outcomes or [],
        "outcomePrices": [float(p) for p in (prices or [])],
        "volume24hr": volume,
        "liquidity": liquidity,
        "bestBid": best_bid or None,
        "bestAsk": best_ask or None,
        "spread": spread,
        "quality": quality_score(volume, spread if spread is not None else SPREAD_MAX, liquidity),
    }


class PolymarketGammaTool(Tool):
    name = "polymarket_gamma"
    description = "Search open Polymarket markets matching keywords"

    def __init__(self, simulate: bool = False):
        super().__init__(simulate)
        self._catalog: list[dict] = []
        self._catalog_at: float = 0.0

    def _fetch_catalog(self) -> list[dict]:
        """Cached fetch of the top-volume open market catalog.

        Cuts ~300-800ms off every keyword search after the first one
        within the TTL window — the decision engine may search several
        times per inbound signal.
        """
        now = time.monotonic()
        if self._catalog and now - self._catalog_at < CATALOG_TTL_S:
            return self._catalog
        raw = http_get_json(
            GAMMA_URL,
            params={"closed": "false", "active": "true", "limit": 200, "order": "volume24hr", "ascending": "false"},
        )
        self._catalog = raw if isinstance(raw, list) else []
        self._catalog_at = now
        return self._catalog

    @staticmethod
    def _passes_gates(m: dict, min_volume_24h: float, min_liquidity: float, max_spread: float) -> bool:
        if m["volume24hr"] < min_volume_24h or m["liquidity"] < min_liquidity:
            return False
        if m["spread"] is not None and m["spread"] > max_spread:
            return False
        return True

    def call(
        self,
        keywords: list[str],
        limit: int = 8,
        min_volume_24h: float = VOLUME_RED_FLAG,
        min_liquidity: float = LIQUIDITY_MIN,
        max_spread: float = SPREAD_MAX,
        **_,
    ) -> dict:
        """Returns {"markets": [...]} matching any keyword, best quality first.

        Hard gates (strategy sect. 3/7): volume, liquidity, spread.
        Ranking: composite quality score, NOT raw volume.
        """
        kws = [k.lower() for k in keywords if k]
        if not kws:
            return {"markets": []}

        if self.simulate:
            pool = [
                _parse_market({k: v for k, v in m.items() if k != "keywords"})
                for m in _SIM_MARKETS
                if any(kw in m["keywords"] or kw in m["question"].lower() for kw in kws)
            ]
            pool = [m for m in pool if m and self._passes_gates(m, min_volume_24h, min_liquidity, max_spread)]
            pool.sort(key=lambda m: -m["quality"])
            return {"markets": pool[:limit]}

        try:
            raw = self._fetch_catalog()
        except Exception as err:
            self._warn(f"fetch failed: {err}")
            return {"markets": []}

        markets = []
        for m in raw:
            parsed = _parse_market(m)
            if not parsed:
                continue
            q = parsed["question"].lower()
            if any(kw in q for kw in kws) and self._passes_gates(parsed, min_volume_24h, min_liquidity, max_spread):
                markets.append(parsed)
        markets.sort(key=lambda m: -m["quality"])
        return {"markets": markets[:limit]}
