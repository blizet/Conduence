"""High-level runner — consumes scanner ticks, invokes the graph per tick,
and carries position memory between invocations (same pattern as
backend/app/orchestrator/runner.py carries recent_signals)."""

from __future__ import annotations

import sys
import time
from typing import Any

from app.orchestrator.graph import get_compiled_graph
from app.orchestrator.state import ScannerState
from app.subagents.scanner_subagent import stream_market_ticks

TERMINAL_EVENTS = {"ENTER", "STOP_OUT", "SETTLE_WIN", "SETTLE_LOSS"}


async def run_scanner(
    config: dict[str, Any],
    *,
    simulate: bool = False,
    duration_s: float | None = None,
    max_trades: int | None = None,
) -> dict[str, Any]:
    cfg = {**config, "simulate": simulate}
    compiled = get_compiled_graph()

    open_positions: dict[str, Any] = {}
    bankroll = float(cfg.get("portfolio_usd", 10_000))
    watchlist: set[str] = set()
    trade_count = 0
    started = time.time()

    print(f"[runner] mode: {'SIMULATE' if simulate else 'LIVE'}  "
          f"entry band [{cfg.get('entry_ask_min_cents')},{cfg.get('entry_ask_max_cents')}]c  "
          f"stop {cfg.get('stop_bid_cents')}c", file=sys.stderr)

    async for tick in stream_market_ticks(cfg, watchlist):
        if duration_s and time.time() - started > duration_s:
            break
        print(f"[runner] tick: {tick.get('summary', '')[:110]}", file=sys.stderr)

        initial: ScannerState = {
            "signal": tick,
            "config": cfg,
            "open_positions": open_positions,
            "bankroll_usd": bankroll,
            "steps": [],
        }
        final = await compiled.ainvoke(initial)

        if final.get("open_positions") is not None:
            open_positions = final["open_positions"]
        if final.get("bankroll_usd") is not None:
            bankroll = float(final["bankroll_usd"])
        watchlist.clear()
        watchlist.update(open_positions.keys())

        event = (final.get("trade_event") or {}).get("event")
        if event in TERMINAL_EVENTS:
            trade_count += 1
        if max_trades and trade_count >= max_trades:
            break

    print(f"[runner] stopped — {trade_count} trade event(s), "
          f"{len(open_positions)} still open, bankroll ${bankroll:,.2f}", file=sys.stderr)
    return {
        "trade_count": trade_count,
        "open_positions": open_positions,
        "bankroll_usd": bankroll,
    }
