"""kalshiSports — late-game Kalshi soccer paper-trading scanner.

Usage:
  python main.py --simulate                 # offline demo (scripted matches)
  python main.py --simulate --max-trades 3  # stop after 3 trade events
  python main.py                            # live (needs API_FOOTBALL_KEY;
                                            #       Kalshi market data is public)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.orchestrator.runner import run_scanner

CONFIG_PATH = Path(__file__).resolve().parent / "config.json"


def main() -> None:
    parser = argparse.ArgumentParser(description="kalshiSports scanner")
    parser.add_argument("--simulate", action="store_true", help="run fully offline with scripted matches")
    parser.add_argument("--duration", type=float, default=None, help="stop after N seconds")
    parser.add_argument("--max-trades", type=int, default=None, help="stop after N trade events")
    parser.add_argument("--config", default=str(CONFIG_PATH), help="path to config.json")
    args = parser.parse_args()

    config = json.loads(Path(args.config).read_text())
    asyncio.run(
        run_scanner(
            config,
            simulate=args.simulate,
            duration_s=args.duration,
            max_trades=args.max_trades,
        )
    )


if __name__ == "__main__":
    main()
