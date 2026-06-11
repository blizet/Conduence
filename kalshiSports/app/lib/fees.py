"""Kalshi fee math (Feb-2026 schedule).

taker: round_up(0.07   x C x P x (1-P))
maker: round_up(0.0175 x C x P x (1-P))
P in dollars (95c = 0.95), C = contracts, rounded up to the next cent.
"""

from __future__ import annotations

import math

TAKER_RATE = 0.07
MAKER_RATE = 0.0175


def _fee(rate: float, contracts: int, price_dollars: float) -> float:
    raw = rate * contracts * price_dollars * (1.0 - price_dollars)
    return math.ceil(raw * 100) / 100


def taker_fee(contracts: int, price_dollars: float) -> float:
    return _fee(TAKER_RATE, contracts, price_dollars)


def maker_fee(contracts: int, price_dollars: float) -> float:
    return _fee(MAKER_RATE, contracts, price_dollars)
