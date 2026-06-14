"""Arbitrage sub-agent — Polymarket x Kalshi cross-platform scanner.

Standalone template: requires its own LLM (provider + API key + model) to
semantically verify that a Polymarket leg and a Kalshi leg resolve on the same
event, and to write each opportunity's thesis.

Mechanical gates remain deterministic — fees, net edge, liquidity, ask-priced
legs, open status, date proximity, exact numeric thresholds. The LLM only
replaces the token-jaccard semantic check.

Standalone CLI: python -m app.subagents.arbitrage_subagent [--simulate] [--interval 15]
Canvas/registry: wired via app.subagents.registry

Event contract:
{
  "type": "arbitrage", "agent": "arbitrageAgent", "summary": str,
  "direction": "neutral", "strength": float, "keywords": [str],
  "thesis": str, "opportunity": {...}, "legs": {...}, "caveats": [str],
  "ts": iso8601
}
"""

import argparse
import asyncio
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator

from app.llm.client import complete_json
from app.subagents.tool_loop import ARB_SCAN_TOOLS, fetch_scan_markets_from_tools

ARB_POLL_INTERVAL_MS = int(os.getenv("ARB_POLL_INTERVAL_MS", "15000"))
ARB_SIMULATE_INTERVAL_MS = int(os.getenv("ARB_SIMULATE_INTERVAL_MS", "8000"))

KALSHI_TAKER_COEF = 0.07     # fee/contract = coef * P * (1-P)
POLY_TAKER_COEF = 0.072      # crypto category, ~1.8% peak effective (Mar 2026 schedule)
MIN_NET_EDGE = 0.015         # $ per contract after fees
MIN_MATCH_CONFIDENCE = 0.60
MAX_CLOSE_GAP_DAYS = 4.0     # legs resolving further apart are different bets
MIN_LIQUIDITY_USD = 2_000.0  # per leg
MIN_PREFILTER_JACCARD = 0.15 # loose — just ensure some token overlap before paying for LLM

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

STOPWORDS = {
    "will", "the", "a", "an", "be", "by", "on", "in", "at", "of", "to", "or",
    "and", "is", "above", "below", "before", "after", "hit", "reach", "close",
    "trade", "price", "than", "more", "less", "least", "this", "what", "yes", "no",
    "up", "down", "between", "end", "eod", "et", "est",
}
SYNONYMS = {
    "btc": "bitcoin", "xbt": "bitcoin",
    "eth": "ethereum", "ether": "ethereum",
    "sol": "solana", "doge": "dogecoin", "zec": "zcash", "xmr": "monero",
    "$": "usd", "k": "000",
}

_NUM_RE = re.compile(r"\$?(\d[\d,]*\.?\d*)\s*([km])?", re.IGNORECASE)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def extract_numbers(title: str) -> set[float]:
    nums: set[float] = set()
    for raw, suffix in _NUM_RE.findall(title):
        try:
            v = float(raw.replace(",", ""))
        except ValueError:
            continue
        if suffix.lower() == "k":
            v *= 1_000
        elif suffix.lower() == "m":
            v *= 1_000_000
        if v >= 100:  # >=100 = price thresholds; ignore small numerals like "top 5"
            nums.add(v)
    return nums


def tokenize(title: str) -> set[str]:
    words = re.findall(r"[a-z]+", title.lower())
    out: set[str] = set()
    for w in words:
        w = SYNONYMS.get(w, w)
        if w[:3] in MONTHS:
            w = w[:3]
        if w not in STOPWORDS and len(w) > 1:
            out.add(w)
    return out


def parse_date_guess(title: str, fallback_iso: str | None) -> datetime | None:
    if fallback_iso:
        try:
            return datetime.fromisoformat(fallback_iso.replace("Z", "+00:00"))
        except ValueError:
            pass
    m = re.search(r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})", title.lower())
    if m:
        month, day = MONTHS[m.group(1)], int(m.group(2))
        year = now_utc().year + (1 if month < now_utc().month else 0)
        try:
            return datetime(year, month, day, tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


# ----------------------------------------------------------------------
# cheap pre-filter — eliminates obviously-different pairs without LLM
# ----------------------------------------------------------------------
def pre_filter_pair(poly: dict[str, Any], kalshi: dict[str, Any]) -> bool:
    n1, n2 = extract_numbers(poly["title"]), extract_numbers(kalshi["title"])
    if (n1 or n2) and n1 != n2:
        return False  # different thresholds => different bets

    t1, t2 = tokenize(poly["title"]), tokenize(kalshi["title"])
    if not t1 or not t2:
        return False
    jaccard = len(t1 & t2) / len(t1 | t2)
    if jaccard < MIN_PREFILTER_JACCARD:
        return False

    d1, d2 = poly.get("close_dt"), kalshi.get("close_dt")
    if d1 and d2:
        gap_days = abs((d1 - d2).total_seconds()) / 86_400
        if gap_days > MAX_CLOSE_GAP_DAYS:
            return False

    return True


# ----------------------------------------------------------------------
# LLM verification — replaces the token-jaccard "same event" decision
# ----------------------------------------------------------------------
SYSTEM_PROMPT = (
    "You compare two prediction-market questions from different venues (Polymarket and Kalshi) "
    "and decide if they resolve on the SAME underlying event. Two questions resolve on the same "
    "event only when YES on one is logically equivalent to YES on the other — same asset, same "
    "threshold, same date/window, same resolution criterion.\n\n"
    "Return ONLY a JSON object with these exact keys:\n"
    "  same_event: boolean — true only if YES outcomes are logically equivalent\n"
    "  confidence: float in [0.0, 1.0]\n"
    "  reasoning: one short sentence explaining your verdict\n"
    "  thesis: one short sentence stating the arbitrage thesis if same_event is true (else empty string)\n"
    "  keywords: 2-6 lowercase tokens common to both questions (e.g. ['bitcoin','120k','july'])\n"
    "No markdown, no extra commentary."
)


def _resolve_subagent_config(config: dict[str, Any]) -> dict[str, Any]:
    if config.get("execution_tools") is not None:
        return config
    wc = config.get("workflow_context") or {}
    entry = (wc.get("subagent_registry") or {}).get("arbitrageAgent") or {}
    if entry:
        return {**entry, **{k: v for k, v in config.items() if k not in entry}}
    return config


async def _verify_same_event_with_llm(
    poly: dict[str, Any],
    kalshi: dict[str, Any],
    llm_config: dict[str, Any],
    *,
    user_prompt: str = "",
) -> dict[str, Any]:
    poly_close = poly["close_dt"].isoformat() if poly.get("close_dt") else "unknown"
    kalshi_close = kalshi["close_dt"].isoformat() if kalshi.get("close_dt") else "unknown"
    parts = []
    if user_prompt:
        parts.append(f"Strategy focus: {user_prompt}")
    parts.extend(
        [
            f"Polymarket question: {poly['title']}",
            f"Polymarket close: {poly_close}",
            "",
            f"Kalshi question: {kalshi['title']}",
            f"Kalshi close: {kalshi_close}",
        ]
    )
    user_prompt_msg = "\n".join(parts)
    parsed = await complete_json(llm_config, SYSTEM_PROMPT, user_prompt_msg)
    if not parsed:
        return {"same_event": False, "confidence": 0.0, "reasoning": "LLM returned no parseable response", "thesis": "", "keywords": []}

    same = bool(parsed.get("same_event"))
    try:
        confidence = float(parsed.get("confidence") or 0.0)
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = max(0.0, min(1.0, confidence))
    reasoning = str(parsed.get("reasoning") or "").strip()
    thesis = str(parsed.get("thesis") or "").strip()
    raw_kw = parsed.get("keywords") or []
    keywords = [str(k).strip().lower() for k in raw_kw if str(k).strip()][:6]
    return {
        "same_event": same,
        "confidence": confidence,
        "reasoning": reasoning,
        "thesis": thesis,
        "keywords": keywords,
    }


# ----------------------------------------------------------------------
# fees + edge
# ----------------------------------------------------------------------
def kalshi_fee(price: float) -> float:
    return KALSHI_TAKER_COEF * price * (1 - price)


def poly_fee(price: float) -> float:
    return POLY_TAKER_COEF * price * (1 - price)


def evaluate_pair(poly: dict[str, Any], kalshi: dict[str, Any], confidence: float) -> list[dict[str, Any]]:
    """Check both arb directions; return profitable, executable ones."""
    opportunities = []
    directions = [
        ("BUY YES on Polymarket + BUY NO on Kalshi", poly["yes_ask"], kalshi["no_ask"]),
        ("BUY NO on Polymarket + BUY YES on Kalshi", poly["no_ask"], kalshi["yes_ask"]),
    ]
    for label, poly_ask, kalshi_ask in directions:
        if not (0 < poly_ask < 1 and 0 < kalshi_ask < 1):
            continue
        gross = 1.0 - (poly_ask + kalshi_ask)
        fees = poly_fee(poly_ask) + kalshi_fee(kalshi_ask)
        net = gross - fees
        if net < MIN_NET_EDGE:
            continue
        max_size = min(poly["liquidity"], kalshi["liquidity"])
        opportunities.append({
            "direction": label,
            "poly_ask": round(poly_ask, 3),
            "kalshi_ask": round(kalshi_ask, 3),
            "gross_edge": round(gross, 4),
            "fees": round(fees, 4),
            "net_edge": round(net, 4),
            "net_edge_pct": round(net / (poly_ask + kalshi_ask) * 100, 2),
            "max_size_usd": round(max_size, 0),
            "match_confidence": round(confidence, 2),
        })
    return opportunities


# ----------------------------------------------------------------------
# simulate fixtures
# ----------------------------------------------------------------------
def _sim_markets() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    soon = now_utc() + timedelta(days=30)
    poly = [
        {"platform": "polymarket", "title": "Will Bitcoin hit $120,000 by July 31?",
         "slug": "bitcoin-120k-july", "url": "https://polymarket.com/market/bitcoin-120k-july",
         "yes_ask": 0.40, "no_ask": 0.62, "liquidity": 95_000.0, "volume_24h": 310_000.0, "close_dt": soon},
        {"platform": "polymarket", "title": "Will Ethereum trade above $6,000 in July?",
         "slug": "ethereum-6k-july", "url": "https://polymarket.com/market/ethereum-6k-july",
         "yes_ask": 0.35, "no_ask": 0.67, "liquidity": 60_000.0, "volume_24h": 180_000.0, "close_dt": soon},
    ]
    kalshi = [
        {"platform": "kalshi", "title": "Bitcoin price above $120,000 on Jul 31?",
         "ticker": "KXBTC-120K", "url": "https://kalshi.com/markets/KXBTC-120K",
         "yes_ask": 0.47, "no_ask": 0.55, "liquidity": 40_000.0, "volume_24h": 120_000.0, "close_dt": soon},
        {"platform": "kalshi", "title": "Ethereum above $5,000 on Jul 31?",  # different threshold -> must NOT match
         "ticker": "KXETH-5K", "url": "https://kalshi.com/markets/KXETH-5K",
         "yes_ask": 0.30, "no_ask": 0.72, "liquidity": 25_000.0, "volume_24h": 80_000.0, "close_dt": soon},
    ]
    return poly, kalshi


# ----------------------------------------------------------------------
# LLM config validation
# ----------------------------------------------------------------------
def _validate_llm_config(config: dict[str, Any]) -> dict[str, Any]:
    provider = (config.get("llmProvider") or config.get("provider") or "").strip().lower()
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
            f"Arbitrage sub-agent requires LLM config. Missing: {', '.join(missing)}. "
            "Set llmProvider, llmApiKey, and model on the Arbitrage Agent node."
        )

    return {
        "llmProvider": provider,
        "llmApiKey": api_key,
        "model": model,
        "temperature": float(config.get("temperature") or 0.1),
        "maxTokens": int(config.get("maxTokens") or 384),
    }


# ----------------------------------------------------------------------
# scan + build events
# ----------------------------------------------------------------------
async def _build_events(
    poly_markets: list[dict[str, Any]],
    kalshi_markets: list[dict[str, Any]],
    llm_config: dict[str, Any],
    *,
    user_prompt: str = "",
) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for poly in poly_markets:
        if poly["liquidity"] < MIN_LIQUIDITY_USD:
            continue
        for kalshi in kalshi_markets:
            if kalshi["liquidity"] < MIN_LIQUIDITY_USD:
                continue
            if not pre_filter_pair(poly, kalshi):
                continue
            try:
                verdict = await _verify_same_event_with_llm(
                    poly, kalshi, llm_config, user_prompt=user_prompt
                )
            except Exception as exc:
                print(f"[arbitrageAgent] LLM verification failed: {exc}", file=sys.stderr)
                continue
            if not verdict["same_event"] or verdict["confidence"] < MIN_MATCH_CONFIDENCE:
                continue
            for opp in evaluate_pair(poly, kalshi, verdict["confidence"]):
                events.append({
                    "type": "arbitrage",
                    "agent": "arbitrageAgent",
                    "summary": (
                        f"{opp['direction']}: net +{opp['net_edge'] * 100:.1f}c/contract "
                        f"({opp['net_edge_pct']}%) after fees on \"{poly['title'][:80]}\""
                    ),
                    "direction": "neutral",
                    "strength": min(1.0, opp["net_edge"] / 0.05),
                    "keywords": verdict["keywords"] or sorted(tokenize(poly["title"]) & tokenize(kalshi["title"])),
                    "thesis": verdict["thesis"] or (
                        "Same event priced differently across venues — buy YES on one leg and NO on the other "
                        "to lock in the spread after fees."
                    ),
                    "llm_reasoning": verdict["reasoning"],
                    "opportunity": opp,
                    "legs": {
                        "polymarket": {"title": poly["title"], "url": poly["url"],
                                       "liquidity": poly["liquidity"], "volume_24h": poly["volume_24h"],
                                       "close": poly["close_dt"].isoformat() if poly["close_dt"] else None},
                        "kalshi": {"title": kalshi["title"], "url": kalshi["url"], "ticker": kalshi.get("ticker"),
                                   "liquidity": kalshi["liquidity"], "volume_24h": kalshi["volume_24h"],
                                   "close": kalshi["close_dt"].isoformat() if kalshi["close_dt"] else None},
                    },
                    "caveats": [
                        "verify resolution criteria are identical before executing",
                        "prices are top-of-book asks; size beyond top level adds slippage",
                        "capital locked on both venues until resolution",
                    ],
                    "ts": now_utc().isoformat(),
                })
    return events


async def scan(
    simulate: bool,
    llm_config: dict[str, Any],
    execution_tools: list[str],
    tool_configs: dict[str, dict[str, Any]],
    *,
    user_prompt: str = "",
) -> list[dict[str, Any]]:
    if simulate:
        poly_markets, kalshi_markets = _sim_markets()
    else:
        poly_markets, kalshi_markets = await fetch_scan_markets_from_tools(
            execution_tools, tool_configs
        )
    return await _build_events(
        poly_markets, kalshi_markets, llm_config, user_prompt=user_prompt
    )


def _event_key(event: dict[str, Any]) -> str:
    return (
        f"{event['legs']['polymarket']['url']}|"
        f"{event['legs']['kalshi']['url']}|"
        f"{event['opportunity']['direction']}"
    )


class ArbitrageAgent:
    def __init__(self, poll_ms: int = ARB_POLL_INTERVAL_MS) -> None:
        self.poll_ms = poll_ms
        self._seen_keys: set[str] = set()

    async def stream_arbitrage_signals(
        self,
        llm_config: dict[str, Any],
        execution_tools: list[str],
        tool_configs: dict[str, dict[str, Any]],
        *,
        user_prompt: str = "",
        simulate: bool = False,
    ) -> AsyncIterator[dict[str, Any]]:
        interval_ms = ARB_SIMULATE_INTERVAL_MS if simulate else self.poll_ms
        while True:
            try:
                for event in await scan(
                    simulate,
                    llm_config,
                    execution_tools,
                    tool_configs,
                    user_prompt=user_prompt,
                ):
                    key = _event_key(event)
                    if not simulate and key in self._seen_keys:
                        continue
                    self._seen_keys.add(key)
                    yield event
            except Exception as exc:
                print(f"[arbitrageAgent] scan failed: {exc}", file=sys.stderr)
            await asyncio.sleep(interval_ms / 1000)


arbitrage_agent = ArbitrageAgent()


async def stream_arbitrage_signals(config: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    """Registry entry — streams arb signals from workflow subagent registry."""
    cfg = _resolve_subagent_config(config)
    llm_config = _validate_llm_config({**cfg, **(cfg.get("llm_config") or {})})
    simulate = bool(cfg.get("simulate"))
    execution_tools = list(cfg.get("execution_tools") or [])
    tool_configs = dict(cfg.get("tool_configs") or {})
    user_prompt = (cfg.get("userPrompt") or "").strip()

    if not simulate:
        if not execution_tools:
            raise ValueError(
                "Wire polymarketGamma and kalshi into the Arbitrage Agent node (left handle)."
            )
        missing = [t for t in ("polymarketGamma", "kalshi") if t not in execution_tools]
        if missing:
            raise ValueError(
                f"Arbitrage Agent missing required scan tools: {', '.join(missing)}. "
                "Connect polymarketGamma and kalshi to the left handle."
            )

    async for event in arbitrage_agent.stream_arbitrage_signals(
        llm_config,
        execution_tools,
        tool_configs,
        user_prompt=user_prompt,
        simulate=simulate,
    ):
        yield event


async def validate_arbitrage_config(config: dict[str, Any]) -> None:
    cfg = _resolve_subagent_config(config)
    _validate_llm_config({**cfg, **(cfg.get("llm_config") or {})})
    if cfg.get("simulate"):
        return
    execution_tools = list(cfg.get("execution_tools") or [])
    if "polymarketGamma" not in execution_tools or "kalshi" not in execution_tools:
        raise ValueError(
            "Arbitrage Agent requires polymarketGamma and kalshi tools wired on the canvas."
        )


async def _run_cli(simulate: bool, interval_s: float) -> None:
    config = {
        "llmProvider": os.getenv("ARB_LLM_PROVIDER", "gemini"),
        "llmApiKey": os.getenv("ARB_LLM_API_KEY", ""),
        "model": os.getenv("ARB_LLM_MODEL", "gemini-2.0-flash"),
        "execution_tools": ["polymarketGamma", "kalshi"],
        "tool_configs": {},
        "simulate": simulate,
    }
    async for event in stream_arbitrage_signals(config):
        print(json.dumps(event), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Arbitrage sub-agent (arbitrageAgent)")
    parser.add_argument("--simulate", action="store_true")
    parser.add_argument("--interval", type=float, default=ARB_POLL_INTERVAL_MS / 1000)
    args = parser.parse_args()
    asyncio.run(_run_cli(args.simulate, args.interval))


if __name__ == "__main__":
    main()
