"""Polymarket Data API tool — wallet activity (trades + positions)."""

from __future__ import annotations

import random
import time

from .base import Tool, http_get_json

DATA_API = "https://data-api.polymarket.com"

_SIM_TITLES = [
    ("Will Bitcoin hit $120,000 by July 31?", ["bitcoin", "btc"]),
    ("Will Ethereum trade above $6,000 this month?", ["ethereum", "eth"]),
    ("Will Trump sign a crypto executive order this month?", ["trump", "executive order"]),
    ("Will the Fed cut rates at the next FOMC meeting?", ["fed", "rate cut"]),
    ("Will Zcash close above $80 this week?", ["zcash", "zec"]),
]


class PolymarketWalletTool(Tool):
    name = "polymarket_wallet"
    description = "Recent trades and open positions for a Polymarket wallet"

    def call(self, wallet: str, action: str = "trades", limit: int = 20, **_) -> dict:
        if self.simulate:
            return self._simulate(wallet)
        try:
            if action == "positions":
                data = http_get_json(f"{DATA_API}/positions", params={"user": wallet, "limit": limit})
                return {"wallet": wallet, "positions": data if isinstance(data, list) else []}
            data = http_get_json(f"{DATA_API}/trades", params={"user": wallet, "limit": limit})
            trades = [
                {
                    "title": t.get("title", ""),
                    "side": t.get("side", ""),            # BUY | SELL
                    "outcome": t.get("outcome", ""),       # Yes | No
                    "size": float(t.get("size") or 0),
                    "price": float(t.get("price") or 0),
                    "usd": float(t.get("size") or 0) * float(t.get("price") or 0),
                    "timestamp": t.get("timestamp"),
                    "txHash": t.get("transactionHash", ""),
                }
                for t in (data if isinstance(data, list) else [])
            ]
            return {"wallet": wallet, "trades": trades}
        except Exception as err:
            self._warn(f"fetch failed for {wallet}: {err}")
            return {"wallet": wallet, "trades": [], "positions": []}

    def _simulate(self, wallet: str) -> dict:
        # Emit 0-1 fresh synthetic trades per poll so the pipeline has signal.
        if random.random() < 0.5:
            return {"wallet": wallet, "trades": []}
        title, _kw = random.choice(_SIM_TITLES)
        side = random.choice(["BUY", "SELL"])
        outcome = random.choice(["Yes", "No"])
        size = random.uniform(5_000, 80_000)
        price = random.uniform(0.2, 0.8)
        return {
            "wallet": wallet,
            "trades": [
                {
                    "title": title,
                    "side": side,
                    "outcome": outcome,
                    "size": size,
                    "price": price,
                    "usd": size * price,
                    "timestamp": int(time.time()),
                    "txHash": f"0xsim{random.randint(10**6, 10**7)}",
                }
            ],
        }
