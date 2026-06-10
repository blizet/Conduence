"""Arbitrage Mind Agent — Polymarket x Kalshi cross-platform scanner.

HARD RULE: standalone, stdlib only, imports nothing outside this folder.
Emits NDJSON arbitrage events on stdout, same contract style as the
other mind agents.

How a real (not screenshot) arb is qualified — every gate must pass:

1. OPEN ONLY. Polymarket: active=true, closed=false, accepting orders,
   end date in the future. Kalshi: status=open, close_time in the future.
   Closed/settled/unopened markets are never considered.
2. SAME EVENT. Titles are normalized (synonyms, stopwords), numeric
   thresholds ($120,000 == 120k) must MATCH EXACTLY if present, and
   close dates must be within MAX_CLOSE_GAP_DAYS. A match confidence
   in [0,1] is attached; below MIN_MATCH_CONFIDENCE the pair is dropped
   (resolution-criteria mismatch is the #1 way cross-platform "arbs"
   lose money).
3. EXECUTABLE PRICES. Both legs priced at the ASK (what you actually
   pay crossing the spread), never mid or last-trade.
4. FEES. Kalshi taker fee: 0.07 * P * (1-P) per contract (quadratic,
   max ~1.75c at P=0.5). Polymarket category taker fee (2026): modeled
   as coef * P * (1-P) with coef 0.072 for crypto (~1.8% peak). Both
   computed at the actual leg price.
5. EDGE. net = 1 - (ask_A + ask_B) - fee_A - fee_B. Emit only if
   net >= MIN_NET_EDGE (default 1.5c per contract).
6. SIZE. Executable size is capped by the thinner leg's liquidity;
   opportunities under MIN_LIQUIDITY_USD per leg are skipped.

Both directions are checked: (YES on Poly + NO on Kalshi) and
(NO on Poly + YES on Kalshi).

Run:
  python agent.py --simulate          # offline fixtures
  python agent.py --interval 15       # live scan every 15s
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

GAMMA_URL = "https://gamma-api.polymarket.com/markets"
KALSHI_URL = "https://external-api.kalshi.com/trade-api/v2/markets"

KALSHI_TAKER_COEF = 0.07     # fee/contract = coef * P * (1-P)
POLY_TAKER_COEF = 0.072      # crypto category, ~1.8% peak effective (Mar 2026 schedule)
MIN_NET_EDGE = 0.015         # $ per contract after fees
MIN_MATCH_CONFIDENCE = 0.60
MAX_CLOSE_GAP_DAYS = 4.0     # legs resolving further apart are different bets
MIN_LIQUIDITY_USD = 2_000.0  # per leg
MIN_TOKEN_JACCARD = 0.34

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
MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def http_get_json(url: str, params: dict | None = None, timeout: float = 12) -> dict | list:
    if params:
        url = f"{url}?{urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})}"
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "cry-arb-agent/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode())


# ----------------------------------------------------------------------
# title normalization + matching
# ----------------------------------------------------------------------
_NUM_RE = re.compile(r"\$?(\d[\d,]*\.?\d*)\s*([km])?", re.IGNORECASE)


def extract_numbers(title: str) -> set[float]:
    nums = set()
    for raw, suffix in _NUM_RE.findall(title):
        try:
            v = float(raw.replace(",", ""))
        except ValueError:
            continue
        if suffix.lower() == "k":
            v *= 1_000
        elif suffix.lower() == "m":
            v *= 1_000_000
        if v >= 100:  # ignore small numerals like "5" in "top 5"? keep >=100 = price thresholds
            nums.add(v)
    return nums


def tokenize(title: str) -> set[str]:
    words = re.findall(r"[a-z]+", title.lower())
    out = set()
    for w in words:
        w = SYNONYMS.get(w, w)
        if w[:3] in MONTHS:
            w = w[:3]  # july == jul
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


def match_confidence(poly: dict, kalshi: dict) -> float:
    """0..1 score that two markets resolve on the same fact."""
    t1, t2 = tokenize(poly["title"]), tokenize(kalshi["title"])
    if not t1 or not t2:
        return 0.0
    jaccard = len(t1 & t2) / len(t1 | t2)
    if jaccard < MIN_TOKEN_JACCARD:
        return 0.0

    n1, n2 = extract_numbers(poly["title"]), extract_numbers(kalshi["title"])
    if n1 or n2:
        if n1 != n2:
            return 0.0          # different thresholds => different bets, hard reject
        number_bonus = 0.25
    else:
        number_bonus = 0.0

    d1, d2 = poly.get("close_dt"), kalshi.get("close_dt")
    if d1 and d2:
        gap = abs((d1 - d2).total_seconds()) / 86_400
        if gap > MAX_CLOSE_GAP_DAYS:
            return 0.0          # resolving days apart => different bets
        date_bonus = 0.20 * (1 - gap / MAX_CLOSE_GAP_DAYS)
    else:
        date_bonus = 0.0        # unknown dates: no bonus, rely on text+numbers

    return min(1.0, 0.65 * jaccard + number_bonus + date_bonus + 0.15)


# ----------------------------------------------------------------------
# fees + edge
# ----------------------------------------------------------------------
def kalshi_fee(price: float) -> float:
    return KALSHI_TAKER_COEF * price * (1 - price)


def poly_fee(price: float) -> float:
    return POLY_TAKER_COEF * price * (1 - price)


def evaluate_pair(poly: dict, kalshi: dict, confidence: float) -> list[dict]:
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
# fetchers (open markets only)
# ----------------------------------------------------------------------
def fetch_polymarket(limit: int = 300) -> list[dict]:
    raw = http_get_json(GAMMA_URL, params={
        "closed": "false", "active": "true", "archived": "false",
        "limit": limit, "order": "volume24hr", "ascending": "false",
    })
    out = []
    for m in raw if isinstance(raw, list) else []:
        title = m.get("question") or ""
        if not title or m.get("closed") or not m.get("active", True):
            continue
        if m.get("acceptingOrders") is False:
            continue
        try:
            best_bid = float(m.get("bestBid") or 0)
            best_ask = float(m.get("bestAsk") or 0)
        except (TypeError, ValueError):
            continue
        if not (0 < best_ask < 1):
            continue
        close_dt = parse_date_guess(title, m.get("endDate"))
        if close_dt and close_dt < now_utc():
            continue  # already past resolution time => effectively closed
        out.append({
            "platform": "polymarket",
            "title": title,
            "slug": m.get("slug", ""),
            "url": f"https://polymarket.com/market/{m.get('slug', '')}",
            "yes_ask": best_ask,
            "no_ask": 1.0 - best_bid if best_bid > 0 else 1.0,
            "liquidity": float(m.get("liquidity") or 0),
            "volume_24h": float(m.get("volume24hr") or 0),
            "close_dt": close_dt,
        })
    return out


def fetch_kalshi(limit: int = 200, pages: int = 3) -> list[dict]:
    out, cursor = [], None
    for _ in range(pages):
        params = {"status": "open", "limit": limit}
        if cursor:
            params["cursor"] = cursor
        payload = http_get_json(KALSHI_URL, params=params)
        markets = payload.get("markets", []) if isinstance(payload, dict) else []
        for m in markets:
            if m.get("status") != "open":
                continue
            title = m.get("title") or ""
            yes_ask, no_ask = m.get("yes_ask"), m.get("no_ask")
            if not title or not yes_ask or not no_ask:
                continue
            close_dt = parse_date_guess(title, m.get("close_time"))
            if close_dt and close_dt < now_utc():
                continue
            out.append({
                "platform": "kalshi",
                "title": title,
                "ticker": m.get("ticker", ""),
                "url": f"https://kalshi.com/markets/{m.get('ticker', '')}",
                "yes_ask": float(yes_ask) / 100.0,   # cents -> dollars
                "no_ask": float(no_ask) / 100.0,
                "liquidity": float(m.get("liquidity") or 0) / 100.0,
                "volume_24h": float(m.get("volume_24h") or m.get("volume") or 0),
                "close_dt": close_dt,
            })
        cursor = payload.get("cursor") if isinstance(payload, dict) else None
        if not cursor or not markets:
            break
    return out


# ----------------------------------------------------------------------
# simulate fixtures
# ----------------------------------------------------------------------
def _sim_markets() -> tuple[list[dict], list[dict]]:
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
# main loop
# ----------------------------------------------------------------------
def scan(simulate: bool) -> list[dict]:
    if simulate:
        poly_markets, kalshi_markets = _sim_markets()
    else:
        with ThreadPoolExecutor(max_workers=2) as pool:   # both venues in parallel
            poly_f = pool.submit(fetch_polymarket)
            kalshi_f = pool.submit(fetch_kalshi)
            poly_markets, kalshi_markets = poly_f.result(), kalshi_f.result()

    events = []
    for poly in poly_markets:
        if poly["liquidity"] < MIN_LIQUIDITY_USD:
            continue
        for kalshi in kalshi_markets:
            if kalshi["liquidity"] < MIN_LIQUIDITY_USD:
                continue
            confidence = match_confidence(poly, kalshi)
            if confidence < MIN_MATCH_CONFIDENCE:
                continue
            for opp in evaluate_pair(poly, kalshi, confidence):
                events.append({
                    "type": "arbitrage",
                    "agent": "arbitrageAgent",
                    "summary": (
                        f"{opp['direction']}: net +{opp['net_edge'] * 100:.1f}c/contract "
                        f"({opp['net_edge_pct']}%) after fees on \"{poly['title'][:80]}\""
                    ),
                    "direction": "neutral",     # market-neutral by construction
                    "strength": min(1.0, opp["net_edge"] / 0.05),
                    "keywords": sorted(tokenize(poly["title"]) & tokenize(kalshi["title"])),
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


def run(simulate: bool, interval: float) -> None:
    seen: set[str] = set()
    while True:
        started = time.monotonic()
        try:
            for event in scan(simulate):
                key = f"{event['legs']['polymarket']['url']}|{event['legs']['kalshi']['url']}|{event['opportunity']['direction']}"
                if key in seen:
                    continue
                seen.add(key)
                sys.stdout.write(json.dumps(event) + "\n")
                sys.stdout.flush()
            elapsed_ms = (time.monotonic() - started) * 1000
            print(f"[arbitrageAgent] scan done in {elapsed_ms:.0f}ms", file=sys.stderr)
        except Exception as err:
            print(f"[arbitrageAgent] scan failed: {err}", file=sys.stderr)
        time.sleep(interval)


def main() -> None:
    parser = argparse.ArgumentParser(description="Standalone Polymarket x Kalshi arbitrage mind agent")
    parser.add_argument("--simulate", action="store_true", help="offline fixtures, no network")
    parser.add_argument("--interval", type=float, default=15.0, help="seconds between scans")
    args = parser.parse_args()
    print(
        f"[arbitrageAgent] starting mode={'simulate' if args.simulate else 'live'} interval={args.interval}s "
        f"min_net_edge={MIN_NET_EDGE * 100:.1f}c min_match_conf={MIN_MATCH_CONFIDENCE}",
        file=sys.stderr,
    )
    run(args.simulate, args.interval)


if __name__ == "__main__":
    main()
