"""Whale wallet sub-agent — polls Polymarket wallets and emits corroboration signals.

Ported from cry/subAgents/whale_agent.py. Requires polymarket_wallet tool on the
sub-agent's tool belt (canvas edge: Polymarket Wallet → Whale SubAgent).
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from app.tools.polymarket_wallet import fetch_polymarket_wallet

MIN_TRADE_USD = 1_000.0
DEFAULT_POLL_S = float(os.getenv("WHALE_SUBAGENT_POLL_S", "30"))


def _keywords_from_title(title: str) -> list[str]:
    stop = {
        "will", "the", "a", "an", "by", "this", "be", "above", "below", "hit",
        "close", "trade", "trades", "at", "in", "on", "of", "to", "next", "before",
        "month", "week", "year", "quarter", "sign", "sees", "meeting",
    }
    words = [w.strip("?,.$%()").lower() for w in title.split()]
    return [w for w in words if w and w not in stop and not w.replace(",", "").replace(".", "").isdigit()]


def _trade_to_signal(wallet: str, trade: dict[str, Any]) -> dict[str, Any]:
    buys_yes = (trade.get("side") == "BUY") == (trade.get("outcome") == "Yes")
    direction = "bullish" if buys_yes else "bearish"
    usd = float(trade.get("usd") or trade.get("size", 0) * trade.get("price", 0))
    strength = min(1.0, usd / 100_000.0) * 0.9 + 0.1
    title = trade.get("title") or trade.get("question", "")
    return {
        "type": "whale",
        "agent": "whaleWallet",
        "keywords": _keywords_from_title(title),
        "direction": direction,
        "strength": round(max(0.0, min(1.0, strength)), 3),
        "summary": (
            f"{wallet[:10]}… {trade.get('side')} {trade.get('outcome')} "
            f"@{float(trade.get('price', 0)):.2f} (${usd:,.0f}) on \"{title}\""
        ),
        "data": {"wallet": wallet, "trade": trade},
        "ts": datetime.now(timezone.utc).isoformat(),
    }


SIMULATED_TRADES = [
    {
        "side": "BUY",
        "outcome": "Yes",
        "price": 0.62,
        "usd": 24_500,
        "title": "Will Bitcoin hit $120k in 2026?",
        "txHash": "sim-whale-1",
    },
    {
        "side": "BUY",
        "outcome": "No",
        "price": 0.41,
        "usd": 18_000,
        "title": "Will Ethereum flip Bitcoin market cap in 2026?",
        "txHash": "sim-whale-2",
    },
]


async def stream_whale_signals(config: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    wallets = [w.strip() for w in (config.get("walletAddresses") or []) if w.strip()]
    if not wallets:
        raise ValueError("walletAddresses required — configure on Whale Wallet sub-agent node")

    poll_s = float(config.get("pollIntervalS") or DEFAULT_POLL_S)
    simulate = bool(config.get("simulate"))
    seen: set[str] = set()
    sim_idx = 0

    while True:
        if simulate:
            trade = SIMULATED_TRADES[sim_idx % len(SIMULATED_TRADES)]
            sim_idx += 1
            tx = trade["txHash"]
            if tx not in seen:
                seen.add(tx)
                yield _trade_to_signal(wallets[0], trade)
        else:
            for wallet in wallets:
                result = await fetch_polymarket_wallet(
                    {
                        "wallet": wallet,
                        "action": "trades",
                        "limit": int(config.get("limit") or 20),
                    }
                )
                if not result.get("ok"):
                    continue
                for trade in result.get("data", {}).get("trades", []):
                    tx = trade.get("txHash") or f"{wallet}:{trade.get('timestamp')}:{trade.get('title')}"
                    if tx in seen:
                        continue
                    usd = float(trade.get("usd") or 0)
                    if usd < MIN_TRADE_USD:
                        continue
                    seen.add(tx)
                    yield _trade_to_signal(wallet, trade)

        await asyncio.sleep(poll_s)
