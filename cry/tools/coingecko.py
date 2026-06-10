"""CoinGecko price-feed tool (free API, no key needed)."""

from __future__ import annotations

import random

from .base import Tool, http_get_json

COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price"

# offline fixtures roughly shaped like real output
_SIM_BASE = {
    "bitcoin": 104_000.0,
    "ethereum": 5_200.0,
    "solana": 240.0,
    "ripple": 2.8,
    "dogecoin": 0.41,
    "zcash": 68.0,
    "monero": 240.0,
}


class CoinGeckoPriceTool(Tool):
    name = "coingecko_price"
    description = "Spot price + 24h change for coingecko ids"

    def call(self, ids: list[str], **_) -> dict:
        """Returns {coingecko_id: {"usd": float, "usd_24h_change": float}}."""
        if self.simulate:
            return {
                cid: {
                    "usd": _SIM_BASE.get(cid, 1.0) * random.uniform(0.97, 1.03),
                    "usd_24h_change": random.uniform(-6.0, 6.0),
                }
                for cid in ids
            }
        try:
            data = http_get_json(
                COINGECKO_URL,
                params={
                    "ids": ",".join(ids),
                    "vs_currencies": "usd",
                    "include_24hr_change": "true",
                },
            )
            return data if isinstance(data, dict) else {}
        except Exception as err:
            self._warn(f"fetch failed: {err}")
            return {}
