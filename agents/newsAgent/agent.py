"""News mind agent — autonomous CoinDesk feed (platform id: newsAgent).

Standalone: python agent.py [--simulate] [--interval 30]
Canvas/registry: imported by backend via app.mind_agents.loader

Event contract:
{
  "type": "news", "agent": "newsAgent", "headline": str, "url": str,
  "publishedAt": iso8601, "sentiment": "bullish|bearish|neutral",
  "keywords": [str], "categories": [str], "thesis": str, "source": str, "ts": iso8601
}
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import sys
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from coindesk import fetch_latest_articles
from news_utils import extract_short_tail_keywords, infer_news_categories, infer_sentiment

NEWS_POLL_INTERVAL_MS = int(os.getenv("NEWS_POLL_INTERVAL_MS", "30000"))
SIMULATE_INTERVAL_MS = int(os.getenv("NEWS_SIMULATE_INTERVAL_MS", "8000"))
COINDESK_API_KEY = os.getenv("COINDESK_API_KEY", "").strip()

SIMULATED_HEADLINES = [
    "Trump signs executive order creating US strategic crypto reserve",
    "Bitcoin ETF sees record $1.2B daily inflow as BlackRock accumulates",
    "SEC drops lawsuit against major altcoin project, XRP rallies",
    "Fed signals rate cut in next FOMC meeting, risk assets surge",
    "Major exchange halts withdrawals amid insolvency rumors",
    "EU regulators push delisting of privacy coins, Monero and Zcash slide",
    "Ethereum DeFi TVL hits yearly high as Aave and Lido grow",
    "Whale moves 12,000 BTC to Coinbase, sell pressure feared",
    "Zcash jumps 18% on shielded-adoption news while Bitcoin trades flat",
    "CPI comes in hot, traders price out rate cut, Bitcoin drops 4%",
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_thesis(headline: str, sentiment: str, keywords: list[str]) -> str:
    subject = keywords[0] if keywords else "crypto"
    if sentiment == "bullish":
        return f"News is a positive catalyst for {subject}; expect upward repricing in related markets."
    if sentiment == "bearish":
        return f"News is a negative catalyst for {subject}; expect downward repricing in related markets."
    return f"News mentions {subject} but direction is unclear; treat as context only."


def _resolve_api_key(api_key: str | None = None) -> str:
    key = (api_key or "").strip() or COINDESK_API_KEY
    if not key:
        raise ValueError("CoinDesk API key required — set COINDESK_API_KEY or pass apiKey")
    return key


def _make_signal(
    *,
    headline: str,
    summary: str = "",
    url: str = "",
    published_at: str | None = None,
    source: str = "CoinDesk",
) -> dict[str, Any]:
    keywords = extract_short_tail_keywords(headline, summary)
    sentiment = infer_sentiment(headline)
    return {
        "type": "news",
        "agent": "newsAgent",
        "headline": headline,
        "url": url,
        "publishedAt": published_at or _now_iso(),
        "sentiment": sentiment,
        "keywords": keywords,
        "categories": infer_news_categories(headline, keywords),
        "thesis": build_thesis(headline, sentiment, keywords),
        "source": source,
        "ts": _now_iso(),
    }


def _article_to_signal(article: dict[str, Any]) -> dict[str, Any]:
    return _make_signal(
        headline=article["title"],
        summary=article.get("summary") or "",
        url=article.get("url") or "",
        published_at=article.get("publishedAt"),
        source=article.get("source") or "CoinDesk",
    )


def _signal_key(signal: dict[str, Any]) -> str:
    return signal.get("url") or signal.get("headline", "")


class NewsAgent:
    def __init__(self, poll_ms: int = NEWS_POLL_INTERVAL_MS) -> None:
        self.poll_ms = poll_ms
        self._seen_keys: set[str] = set()

    async def poll_once(self, api_key: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
        key = _resolve_api_key(api_key)
        result = await fetch_latest_articles({"apiKey": key, "limit": limit})
        signals = [_article_to_signal(a) for a in result["articles"]]
        signals.sort(key=lambda s: s.get("publishedAt", ""), reverse=True)
        return signals

    async def stream_simulated_signals(self) -> AsyncIterator[dict[str, Any]]:
        pool = list(SIMULATED_HEADLINES)
        random.shuffle(pool)
        while True:
            if not pool:
                pool = list(SIMULATED_HEADLINES)
                random.shuffle(pool)
            headline = pool.pop()
            yield _make_signal(headline=headline, url="https://simulated.local/news", source="simulated")
            await asyncio.sleep(SIMULATE_INTERVAL_MS / 1000)

    async def stream_news_signals(
        self, api_key: str | None = None, limit: int = 20, simulate: bool = False
    ) -> AsyncIterator[dict[str, Any]]:
        if simulate:
            async for signal in self.stream_simulated_signals():
                yield signal
            return

        key = _resolve_api_key(api_key)
        while True:
            try:
                batch = await self.poll_once(key, limit)
                fresh = [s for s in batch if _signal_key(s) not in self._seen_keys]
                if fresh:
                    signal = fresh[0]
                    self._seen_keys.add(_signal_key(signal))
                    yield signal
            except Exception as exc:
                print(f"[newsAgent] poll failed: {exc}", file=sys.stderr)
            await asyncio.sleep(self.poll_ms / 1000)


news_agent = NewsAgent()


async def _run_cli(simulate: bool, interval_s: float, limit: int) -> None:
    agent = NewsAgent(poll_ms=int(interval_s * 1000))
    if simulate:
        stream = agent.stream_simulated_signals()
    else:
        stream = agent.stream_news_signals(limit=limit, simulate=False)

    async for signal in stream:
        print(json.dumps(signal), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="News mind agent (newsAgent)")
    parser.add_argument("--simulate", action="store_true")
    parser.add_argument("--interval", type=float, default=NEWS_POLL_INTERVAL_MS / 1000)
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()
    asyncio.run(_run_cli(args.simulate, args.interval, args.limit))


if __name__ == "__main__":
    main()
