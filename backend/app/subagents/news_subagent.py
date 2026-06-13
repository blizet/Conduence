"""News sub-agent — autonomous CoinDesk feed (platform id: newsAgent).

Standalone template: requires its own LLM (provider + API key + model) to infer
sentiment, categories, keywords, thesis, direction, and strength from each headline.

Standalone CLI: python -m app.subagents.news_subagent [--simulate] [--interval 30]
Canvas/registry: wired via app.subagents.registry

Event contract:
{
  "type": "news", "agent": "newsAgent", "headline": str, "url": str,
  "publishedAt": iso8601, "sentiment": "bullish|bearish|neutral",
  "direction": "bullish|bearish|neutral", "strength": float,
  "keywords": [str], "categories": [str], "thesis": str,
  "summary": str, "source": str, "ts": iso8601
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

from app.llm.client import complete_json
from app.subagents.news_coindesk import fetch_latest_articles

NEWS_POLL_INTERVAL_MS = int(os.getenv("NEWS_POLL_INTERVAL_MS", "30000"))
SIMULATE_INTERVAL_MS = int(os.getenv("NEWS_SIMULATE_INTERVAL_MS", "8000"))
COINDESK_API_KEY = os.getenv("COINDESK_API_KEY", "").strip()

ALLOWED_CATEGORIES = ["Crypto", "Finance", "Economics", "Politics", "Entertainment", "Weather"]
ALLOWED_DIRECTIONS = {"bullish", "bearish", "neutral"}

SIMULATED_HEADLINES = [
    ("Trump signs executive order creating US strategic crypto reserve",
     "President's order directs Treasury to acquire seized BTC, ETH, and altcoins for the reserve."),
    ("Bitcoin ETF sees record $1.2B daily inflow as BlackRock accumulates",
     "Spot ETF flows hit yearly high; iShares Bitcoin Trust adds 12,000 BTC to its position."),
    ("SEC drops lawsuit against major altcoin project, XRP rallies",
     "Two-year case dismissed; XRP surges 18% on resolution of regulatory overhang."),
    ("Fed signals rate cut in next FOMC meeting, risk assets surge",
     "Powell's testimony hints at 50bps cut path; equities and crypto extend gains."),
    ("Major exchange halts withdrawals amid insolvency rumors",
     "Top-10 venue cites 'technical issues'; on-chain data shows large outflows from hot wallets."),
    ("EU regulators push delisting of privacy coins, Monero and Zcash slide",
     "MiCA implementation forces delisting on EEA-licensed venues by Q3."),
    ("Ethereum DeFi TVL hits yearly high as Aave and Lido grow",
     "Aggregate TVL crosses $80B; staking derivatives lead the expansion."),
    ("Whale moves 12,000 BTC to Coinbase, sell pressure feared",
     "Address dormant since 2021 deposits ~$1.2B in BTC to a known exchange wallet."),
    ("Zcash jumps 18% on shielded-adoption news while Bitcoin trades flat",
     "Shielded supply ratio climbs to 30%; wallets ship native shielded UX upgrades."),
    ("CPI comes in hot, traders price out rate cut, Bitcoin drops 4%",
     "Headline CPI at 3.4% vs 3.1% expected; rate-cut odds fall sharply."),
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validate_llm_config(config: dict[str, Any]) -> dict[str, Any]:
    """Return normalized LLM config or raise ValueError with what's missing."""
    provider = (config.get("llmProvider") or config.get("provider") or "").strip().lower()
    api_key = (config.get("llmApiKey") or config.get("apiKey") or "").strip() \
        if config.get("llmApiKey") else (config.get("llmApiKey") or "").strip()
    # Use llmApiKey explicitly — apiKey is for the CoinDesk feed key
    api_key = (config.get("llmApiKey") or "").strip()
    model = (config.get("model") or "").strip()

    missing = []
    if provider not in {"openai", "claude", "gemini"}:
        missing.append("llmProvider (openai|claude|gemini)")
    if not api_key:
        missing.append("llmApiKey")
    if not model:
        missing.append("model")
    if missing:
        raise ValueError(
            f"News sub-agent requires LLM config. Missing: {', '.join(missing)}. "
            "Set llmProvider, llmApiKey, and model on the News Agent node."
        )

    return {
        "llmProvider": provider,
        "llmApiKey": api_key,
        "model": model,
        "temperature": float(config.get("temperature") or 0.2),
        "maxTokens": int(config.get("maxTokens") or 512),
    }


SYSTEM_PROMPT = (
    "You are a crypto/financial news analyst. Given a headline and optional summary, "
    "classify the news for trading. Return ONLY a JSON object with these exact keys:\n"
    "  sentiment: one of 'bullish', 'bearish', 'neutral'\n"
    "  direction: same as sentiment\n"
    "  strength: float in [0.0, 1.0] — your conviction in the direction\n"
    "  keywords: 3-8 short uppercase tickers or topic tokens (e.g. ['BTC','ETF','SEC'])\n"
    "  categories: 1-3 from ['Crypto','Finance','Economics','Politics','Entertainment','Weather']\n"
    "  thesis: one sentence explaining the trade implication\n"
    "No markdown, no extra commentary."
)


async def _infer_with_llm(headline: str, summary: str, llm_config: dict[str, Any]) -> dict[str, Any]:
    """Call the LLM to enrich a headline. Raises if the LLM returns no usable output."""
    user_prompt = f"Headline: {headline}\n\nSummary: {summary or '(none)'}"
    parsed = await complete_json(llm_config, SYSTEM_PROMPT, user_prompt)
    if not parsed:
        raise RuntimeError("LLM returned no parseable JSON for news enrichment")

    sentiment = str(parsed.get("sentiment") or "").strip().lower()
    if sentiment not in ALLOWED_DIRECTIONS:
        sentiment = "neutral"
    direction = str(parsed.get("direction") or sentiment).strip().lower()
    if direction not in ALLOWED_DIRECTIONS:
        direction = sentiment

    try:
        strength = float(parsed.get("strength") or 0.5)
    except (TypeError, ValueError):
        strength = 0.5
    strength = max(0.0, min(1.0, strength))

    raw_keywords = parsed.get("keywords") or []
    keywords = [str(k).strip() for k in raw_keywords if str(k).strip()][:8]

    raw_categories = parsed.get("categories") or []
    categories = [c for c in (str(x).strip() for x in raw_categories) if c in ALLOWED_CATEGORIES][:3]
    if not categories:
        categories = ["Finance"]

    thesis = str(parsed.get("thesis") or "").strip() or (
        f"News is {sentiment}; expect related markets to reprice {direction}."
    )

    return {
        "sentiment": sentiment,
        "direction": direction,
        "strength": round(strength, 3),
        "keywords": keywords,
        "categories": categories,
        "thesis": thesis,
    }


async def _make_signal(
    *,
    headline: str,
    summary: str,
    url: str,
    published_at: str | None,
    source: str,
    llm_config: dict[str, Any],
) -> dict[str, Any]:
    inferred = await _infer_with_llm(headline, summary, llm_config)
    return {
        "type": "news",
        "agent": "newsAgent",
        "headline": headline,
        "url": url,
        "publishedAt": published_at or _now_iso(),
        "sentiment": inferred["sentiment"],
        "direction": inferred["direction"],
        "strength": inferred["strength"],
        "keywords": inferred["keywords"],
        "categories": inferred["categories"],
        "thesis": inferred["thesis"],
        "summary": summary,
        "source": source,
        "ts": _now_iso(),
    }


def _signal_key(signal: dict[str, Any]) -> str:
    return signal.get("url") or signal.get("headline", "")


class NewsAgent:
    def __init__(self, poll_ms: int = NEWS_POLL_INTERVAL_MS) -> None:
        self.poll_ms = poll_ms
        self._seen_keys: set[str] = set()

    async def poll_once(
        self, coindesk_key: str, llm_config: dict[str, Any], limit: int = 20
    ) -> list[dict[str, Any]]:
        result = await fetch_latest_articles({"apiKey": coindesk_key, "limit": limit})
        signals: list[dict[str, Any]] = []
        for article in result["articles"]:
            try:
                signal = await _make_signal(
                    headline=article["title"],
                    summary=article.get("summary") or "",
                    url=article.get("url") or "",
                    published_at=article.get("publishedAt"),
                    source=article.get("source") or "CoinDesk",
                    llm_config=llm_config,
                )
                signals.append(signal)
            except Exception as exc:
                print(f"[newsAgent] LLM enrichment failed for '{article.get('title')}': {exc}", file=sys.stderr)
        signals.sort(key=lambda s: s.get("publishedAt", ""), reverse=True)
        return signals

    async def stream_simulated_signals(
        self, llm_config: dict[str, Any]
    ) -> AsyncIterator[dict[str, Any]]:
        pool = list(SIMULATED_HEADLINES)
        random.shuffle(pool)
        while True:
            if not pool:
                pool = list(SIMULATED_HEADLINES)
                random.shuffle(pool)
            headline, summary = pool.pop()
            try:
                yield await _make_signal(
                    headline=headline,
                    summary=summary,
                    url="https://simulated.local/news",
                    published_at=None,
                    source="simulated",
                    llm_config=llm_config,
                )
            except Exception as exc:
                print(f"[newsAgent] simulate LLM call failed: {exc}", file=sys.stderr)
            await asyncio.sleep(SIMULATE_INTERVAL_MS / 1000)

    async def stream_news_signals(
        self,
        coindesk_key: str,
        llm_config: dict[str, Any],
        limit: int = 20,
        simulate: bool = False,
    ) -> AsyncIterator[dict[str, Any]]:
        if simulate:
            async for signal in self.stream_simulated_signals(llm_config):
                yield signal
            return

        while True:
            try:
                batch = await self.poll_once(coindesk_key, llm_config, limit)
                fresh = [s for s in batch if _signal_key(s) not in self._seen_keys]
                if fresh:
                    signal = fresh[0]
                    self._seen_keys.add(_signal_key(signal))
                    yield signal
            except Exception as exc:
                print(f"[newsAgent] poll failed: {exc}", file=sys.stderr)
            await asyncio.sleep(self.poll_ms / 1000)


news_agent = NewsAgent()


async def stream_news_signals(config: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    """Registry entry — streams news signals from node config."""
    llm_config = _validate_llm_config(config)
    simulate = bool(config.get("simulate"))
    coindesk_key = (config.get("apiKey") or "").strip() or COINDESK_API_KEY
    if not simulate and not coindesk_key:
        raise ValueError(
            "CoinDesk data API key required (set apiKey on the News Agent node or COINDESK_API_KEY env)."
        )
    limit = int(config.get("limit") or config.get("newsPollLimit") or 20)
    async for signal in news_agent.stream_news_signals(coindesk_key, llm_config, limit, simulate=simulate):
        yield signal


async def validate_news_config(config: dict[str, Any]) -> None:
    """Refuse to run unless LLM config is complete (+ data key if not simulated)."""
    llm_config = _validate_llm_config(config)
    if config.get("simulate"):
        return
    coindesk_key = (config.get("apiKey") or "").strip() or COINDESK_API_KEY
    if not coindesk_key:
        raise ValueError(
            "CoinDesk data API key required — set apiKey on the News Agent node, "
            "or COINDESK_API_KEY in backend/.env, or start with simulate=true."
        )
    # Sanity-check the CoinDesk endpoint; LLM credentials are validated on first call.
    await fetch_latest_articles({"apiKey": coindesk_key, "limit": int(config.get("limit") or 1)})


async def _run_cli(simulate: bool, interval_s: float, limit: int) -> None:
    config = {
        "llmProvider": os.getenv("NEWS_LLM_PROVIDER", "gemini"),
        "llmApiKey": os.getenv("NEWS_LLM_API_KEY", ""),
        "model": os.getenv("NEWS_LLM_MODEL", "gemini-2.0-flash"),
        "apiKey": os.getenv("COINDESK_API_KEY", ""),
        "simulate": simulate,
        "limit": limit,
    }
    llm_config = _validate_llm_config(config)
    coindesk_key = config["apiKey"]
    agent = NewsAgent(poll_ms=int(interval_s * 1000))
    stream = agent.stream_news_signals(coindesk_key, llm_config, limit=limit, simulate=simulate)
    async for signal in stream:
        print(json.dumps(signal), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="News sub-agent (newsAgent)")
    parser.add_argument("--simulate", action="store_true")
    parser.add_argument("--interval", type=float, default=NEWS_POLL_INTERVAL_MS / 1000)
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()
    asyncio.run(_run_cli(args.simulate, args.interval, args.limit))


if __name__ == "__main__":
    main()
