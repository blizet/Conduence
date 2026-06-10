"""Whale Agent — sample sub-agent.

User specifies 2-3 wallet addresses; this agent polls the Polymarket
Data API (via the `polymarket_wallet` tool) and emits a signal every
time a tracked wallet opens a NEW trade. The orchestrator then takes
over: keyword extraction -> correlation graph -> related markets.
"""

from __future__ import annotations

from subAgents.base import EmitFn, SubAgent
from tools.base import ToolRegistry

# trades below this notional are noise, not whale signal
MIN_TRADE_USD = 1_000.0


def _keywords_from_title(title: str) -> list[str]:
    """Cheap keyword extraction from a market question."""
    stop = {
        "will", "the", "a", "an", "by", "this", "be", "above", "below", "hit",
        "close", "trade", "trades", "at", "in", "on", "of", "to", "next", "before",
        "month", "week", "year", "quarter", "sign", "sees", "meeting",
    }
    words = [w.strip("?,.$%()").lower() for w in title.split()]
    return [w for w in words if w and w not in stop and not w.replace(",", "").replace(".", "").isdigit()]


class WhaleAgent(SubAgent):
    name = "whaleAgent"
    signal_type = "whale"

    def __init__(self, tools: ToolRegistry, emit: EmitFn, wallets: list[str], poll_interval_s: float = 30.0):
        super().__init__(tools, emit, poll_interval_s)
        self.wallets = wallets
        self._seen_tx: set[str] = set()

    def poll(self) -> list[dict]:
        wallet_tool = self.tools.get("polymarket_wallet")
        signals = []

        for wallet in self.wallets:
            result = wallet_tool.call(wallet=wallet, action="trades", limit=20)
            for trade in result.get("trades", []):
                tx = trade.get("txHash") or f"{wallet}:{trade.get('timestamp')}:{trade.get('title')}"
                if tx in self._seen_tx or trade.get("usd", 0) < MIN_TRADE_USD:
                    continue
                self._seen_tx.add(tx)

                # BUY Yes / SELL No => bullish on the event; inverse otherwise
                buys_yes = (trade.get("side") == "BUY") == (trade.get("outcome") == "Yes")
                direction = "bullish" if buys_yes else "bearish"
                # strength scales with trade notional, saturates at $100K
                strength = min(1.0, trade.get("usd", 0) / 100_000.0) * 0.9 + 0.1

                signals.append(
                    self.signal(
                        keywords=_keywords_from_title(trade.get("title", "")),
                        direction=direction,
                        strength=strength,
                        summary=(
                            f"{wallet[:10]}… {trade.get('side')} {trade.get('outcome')} "
                            f"@{trade.get('price', 0):.2f} (${trade.get('usd', 0):,.0f}) "
                            f"on \"{trade.get('title', '')}\""
                        ),
                        data={"wallet": wallet, "trade": trade},
                    )
                )
        return signals
