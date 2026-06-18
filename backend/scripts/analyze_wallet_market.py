"""One-off analysis: trades vs position for a wallet + market."""
import asyncio
import sys
from collections import defaultdict
from datetime import datetime, timezone

import httpx

from app.tools.endpoints import DATA_BASE

WALLET = "0xde7be6d489bce070a959e0cb813128ae659b5f4b"
MARKET = "US x Iran permanent peace deal by June 15, 2026?"


async def main() -> None:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{DATA_BASE}/trades", params={"user": WALLET, "limit": 500})
        all_rows = r.json() if r.status_code < 400 and isinstance(r.json(), list) else []
        rows = [t for t in all_rows if (t.get("title") or "") == MARKET]

        print("fetched_total", len(all_rows), "market_trades", len(rows))

        parsed = []
        for t in rows:
            parsed.append(
                {
                    "ts": int(t.get("timestamp") or 0),
                    "side": t.get("side"),
                    "outcome": t.get("outcome"),
                    "size": float(t.get("size") or 0),
                    "price": float(t.get("price") or 0),
                    "usd": float(t.get("size") or 0) * float(t.get("price") or 0),
                    "tx": (t.get("transactionHash") or "")[:18],
                }
            )
        parsed.sort(key=lambda x: x["ts"])

        buys = [p for p in parsed if (p.get("side") or "").upper() == "BUY"]
        sells = [p for p in parsed if (p.get("side") or "").upper() == "SELL"]
        print("total_shares_bought", round(sum(p["size"] for p in buys), 2))
        print("total_shares_sold", round(sum(p["size"] for p in sells), 2))
        print("net_from_trades", round(sum(p["size"] for p in buys) - sum(p["size"] for p in sells), 2))
        print("unique_prices", len(set(round(p["price"], 6) for p in parsed)))
        print()

        print("CHRONOLOGICAL TRADES:")
        prev_ts = None
        for i, p in enumerate(parsed, 1):
            dt = datetime.fromtimestamp(p["ts"], tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            gap = ""
            if prev_ts:
                mins = (p["ts"] - prev_ts) / 60
                gap = f"  (+{mins:.1f} min)"
            prev_ts = p["ts"]
            line = (
                f"{i:02d}. {dt}{gap} | {p['side']} {p['outcome']} | "
                f"{p['size']:,.2f} sh @ {p['price']*100:.2f}c | "
                f"${p['usd']:,.2f} | tx {p['tx']}..."
            )
            print(line)

        gaps = [(b["ts"] - a["ts"]) / 60 for a, b in zip(parsed, parsed[1:])]
        if gaps:
            print()
            print("gaps_minutes: min", round(min(gaps), 1), "max", round(max(gaps), 1))
            buckets: dict[str, int] = defaultdict(int)
            for g in gaps:
                if g < 1:
                    buckets["<1 min"] += 1
                elif g < 10:
                    buckets["1-10 min"] += 1
                elif g < 60:
                    buckets["10-60 min"] += 1
                elif g < 1440:
                    buckets["1-24 hr"] += 1
                else:
                    buckets[">1 day"] += 1
            print("gap_buckets", dict(buckets))

        pr = await client.get(f"{DATA_BASE}/positions", params={"user": WALLET, "limit": 500})
        if pr.status_code < 400:
            pos = pr.json() if isinstance(pr.json(), list) else []
            match = [p for p in pos if MARKET in str(p.get("title") or p.get("market") or "")]
            print()
            print("POSITIONS matching market:", len(match))
            for p in match[:5]:
                interesting = {
                    k: p.get(k)
                    for k in p
                    if k
                    in [
                        "title",
                        "outcome",
                        "size",
                        "avgPrice",
                        "currentValue",
                        "cashPnl",
                        "percentPnl",
                        "curPrice",
                        "totalBought",
                        "realizedPnl",
                        "proxyWallet",
                    ]
                }
                print(interesting)


if __name__ == "__main__":
    asyncio.run(main())
