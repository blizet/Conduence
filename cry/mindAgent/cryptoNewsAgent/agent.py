"""Crypto News Mind Agent — fully standalone, deployable on its own.

HARD RULE: this folder imports NOTHING outside itself (stdlib only).
It is a black box that emits newline-delimited JSON (NDJSON) news
events on stdout. Anything — the cry orchestrator, a Kafka producer,
a cron job — can subscribe by reading its stdout.

Event contract (one JSON object per line):
{
  "type": "news",
  "agent": "cryptoNewsAgent",
  "headline": str,
  "summary": str,
  "url": str,
  "source": str,            # CoinDesk | simulated
  "sentiment": "bullish" | "bearish" | "neutral",
  "keywords": [str],
  "thesis": str,            # one-line interpretation
  "ts": iso8601
}

Run:
  python agent.py                 # live mode (needs COINDESK_API_KEY)
  python agent.py --simulate      # offline mode, replays sample headlines
  python agent.py --interval 30   # poll every 30s
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

COINDESK_URL = "https://data-api.coindesk.com/news/v1/article/list"

BULLISH_WORDS = [
    "surge", "rally", "soar", "record high", "all-time high", "approval", "approve",
    "inflow", "adoption", "bullish", "breakout", "buy", "accumulate", "pump",
    "rate cut", "etf approval", "reserve", "partnership", "upgrade", "jumps", "gains",
]
BEARISH_WORDS = [
    "crash", "plunge", "dump", "hack", "exploit", "lawsuit", "ban", "sell-off",
    "selloff", "outflow", "bearish", "liquidation", "rate hike", "rejected", "delisting",
    "insolvency", "bankrupt", "falls", "drops", "halted", "crackdown", "stolen",
]

# Short-tail crypto vocabulary used for keyword extraction.
KNOWN_KEYWORDS = [
    "bitcoin", "btc", "ethereum", "eth", "solana", "sol", "xrp", "ripple",
    "dogecoin", "doge", "zcash", "zec", "monero", "xmr", "altcoin", "altcoins",
    "memecoin", "defi", "stablecoin", "usdt", "usdc", "tether",
    "etf", "sec", "fed", "fomc", "rate cut", "rate hike", "cpi", "inflation",
    "trump", "white house", "executive order", "regulation", "lawsuit",
    "hack", "exploit", "delisting", "blackrock", "grayscale", "binance", "coinbase",
    "whale", "liquidation", "halving", "strategic reserve",
]

SIMULATED_HEADLINES = [
    ("Trump signs executive order creating US strategic crypto reserve", "bullish"),
    ("Bitcoin ETF sees record $1.2B daily inflow as BlackRock accumulates", "bullish"),
    ("SEC drops lawsuit against major altcoin project, XRP rallies", "bullish"),
    ("Fed signals rate cut in next FOMC meeting, risk assets surge", "bullish"),
    ("Major exchange halts withdrawals amid insolvency rumors", "bearish"),
    ("EU regulators push delisting of privacy coins, Monero and Zcash slide", "bearish"),
    ("Ethereum DeFi TVL hits yearly high as Aave and Lido grow", "bullish"),
    ("Whale moves 12,000 BTC to Coinbase, sell pressure feared", "bearish"),
    ("Zcash jumps 18% on shielded-adoption news while Bitcoin trades flat", "bullish"),
    ("CPI comes in hot, traders price out rate cut, Bitcoin drops 4%", "bearish"),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def infer_sentiment(text: str) -> str:
    t = text.lower()
    bull = sum(1 for w in BULLISH_WORDS if w in t)
    bear = sum(1 for w in BEARISH_WORDS if w in t)
    if bull > bear:
        return "bullish"
    if bear > bull:
        return "bearish"
    return "neutral"


def extract_keywords(text: str) -> list[str]:
    t = text.lower()
    return [kw for kw in KNOWN_KEYWORDS if kw in t]


def build_thesis(headline: str, sentiment: str, keywords: list[str]) -> str:
    subject = keywords[0] if keywords else "crypto"
    if sentiment == "bullish":
        return f"News is a positive catalyst for {subject}; expect upward repricing in related markets."
    if sentiment == "bearish":
        return f"News is a negative catalyst for {subject}; expect downward repricing in related markets."
    return f"News mentions {subject} but direction is unclear; treat as context only."


def make_event(headline: str, summary: str, url: str, source: str) -> dict:
    keywords = extract_keywords(f"{headline} {summary}")
    sentiment = infer_sentiment(headline)
    return {
        "type": "news",
        "agent": "cryptoNewsAgent",
        "headline": headline,
        "summary": summary[:280],
        "url": url,
        "source": source,
        "sentiment": sentiment,
        "keywords": keywords,
        "thesis": build_thesis(headline, sentiment, keywords),
        "ts": now_iso(),
    }


def fetch_coindesk(api_key: str, limit: int = 20) -> list[dict]:
    params = urllib.parse.urlencode({"limit": limit, "lang": "EN"})
    req = urllib.request.Request(
        f"{COINDESK_URL}?{params}",
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as res:
        payload = json.loads(res.read().decode())
    articles = payload.get("Data") or payload.get("data") or []
    events = []
    for a in articles:
        title = a.get("TITLE") or a.get("title") or ""
        if not title:
            continue
        events.append(
            make_event(
                headline=title,
                summary=str(a.get("BODY") or a.get("summary") or ""),
                url=str(a.get("URL") or a.get("url") or ""),
                source=str(a.get("SOURCE") or "CoinDesk"),
            )
        )
    return events


def emit(event: dict) -> None:
    sys.stdout.write(json.dumps(event) + "\n")
    sys.stdout.flush()


def run(simulate: bool, interval: float, api_key: str | None) -> None:
    seen: set[str] = set()
    sim_pool = list(SIMULATED_HEADLINES)
    random.shuffle(sim_pool)

    while True:
        try:
            if simulate:
                if not sim_pool:
                    sim_pool = list(SIMULATED_HEADLINES)
                    random.shuffle(sim_pool)
                headline, _ = sim_pool.pop()
                event = make_event(headline, "", "https://simulated.local/news", "simulated")
                emit(event)
            else:
                if not api_key:
                    print("[cryptoNewsAgent] COINDESK_API_KEY missing — use --simulate", file=sys.stderr)
                    sys.exit(1)
                for event in fetch_coindesk(api_key):
                    key = event["url"] or event["headline"]
                    if key in seen:
                        continue
                    seen.add(key)
                    emit(event)
        except Exception as err:  # network blips must never kill the feed
            print(f"[cryptoNewsAgent] poll failed: {err}", file=sys.stderr)

        time.sleep(interval)


def main() -> None:
    parser = argparse.ArgumentParser(description="Standalone crypto news mind agent")
    parser.add_argument("--simulate", action="store_true", help="emit sample headlines, no network")
    parser.add_argument("--interval", type=float, default=float(os.getenv("NEWS_POLL_INTERVAL_S", "60")))
    parser.add_argument("--api-key", default=os.getenv("COINDESK_API_KEY"))
    args = parser.parse_args()
    print(
        f"[cryptoNewsAgent] starting mode={'simulate' if args.simulate else 'live'} interval={args.interval}s",
        file=sys.stderr,
    )
    run(args.simulate, args.interval, args.api_key)


if __name__ == "__main__":
    main()
