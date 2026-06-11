"""Summarize the paper-trade log: realized win rate vs average entry price.

Usage: python report.py [path/to/trades.jsonl]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

DEFAULT_LOG = Path(__file__).resolve().parent / "out" / "trades.jsonl"


def main() -> None:
    log = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_LOG
    if not log.exists():
        print(f"no log at {log} — run main.py first")
        return

    events = [json.loads(line) for line in log.read_text().splitlines() if line.strip()]
    entries = [e for e in events if e["event"] == "ENTER"]
    exits = [e for e in events if e["event"] in ("STOP_OUT", "SETTLE_WIN", "SETTLE_LOSS")]
    wins = [e for e in exits if e["event"] == "SETTLE_WIN"]
    stops = [e for e in exits if e["event"] == "STOP_OUT"]
    losses = [e for e in exits if e["event"] == "SETTLE_LOSS"]

    total_pnl = sum(float(e.get("pnl_usd") or 0) for e in exits)
    avg_entry = sum(e["entry_price_cents"] for e in entries) / len(entries) if entries else 0.0
    closed = len(exits)
    win_rate = len(wins) / closed if closed else 0.0
    breakeven = avg_entry / 100.0

    print(f"log              : {log}")
    print(f"entries          : {len(entries)}   (avg entry {avg_entry:.1f}c)")
    print(f"closed           : {closed}   wins {len(wins)} / stops {len(stops)} / losses {len(losses)}")
    print(f"realized win rate: {win_rate:.1%}   vs breakeven ~{breakeven:.1%} (avg entry + fees)")
    print(f"realized pnl     : ${total_pnl:+,.2f}")
    if closed:
        print(f"avg pnl/trade    : ${total_pnl / closed:+,.2f}")
    if closed and win_rate <= breakeven:
        print("WARNING: realized win rate does not beat the price paid — no edge yet.")


if __name__ == "__main__":
    main()
