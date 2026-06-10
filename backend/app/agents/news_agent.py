import asyncio
import os
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from app.agents.coindesk import fetch_latest_articles
from app.agents.news_utils import extract_short_tail_keywords, infer_news_categories, infer_sentiment
from app.config import COINDESK_API_KEY

NEWS_POLL_INTERVAL_MS = int(os.getenv("NEWS_POLL_INTERVAL_MS", "30000"))


def _resolve_api_key(api_key: str | None = None) -> str:
    key = (api_key or "").strip() or COINDESK_API_KEY
    if not key:
        raise ValueError("CoinDesk API key required — set COINDESK_API_KEY or pass apiKey")
    return key


def _article_to_signal(article: dict[str, Any]) -> dict[str, Any]:
    headline = article["title"]
    summary = article.get("summary") or ""
    keywords = extract_short_tail_keywords(headline, summary)
    return {
        "headline": headline,
        "url": article.get("url") or "",
        "publishedAt": article.get("publishedAt") or datetime.now(timezone.utc).isoformat(),
        "sentiment": infer_sentiment(headline),
        "keywords": keywords,
        "categories": infer_news_categories(headline, keywords),
        "source": article.get("source") or "CoinDesk",
    }


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

    async def stream_news_signals(
        self, api_key: str | None = None, limit: int = 20
    ) -> AsyncIterator[dict[str, Any]]:
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
                print(f"[news-agent] poll failed: {exc}")
            await asyncio.sleep(self.poll_ms / 1000)


news_agent = NewsAgent()
