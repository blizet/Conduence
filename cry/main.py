"""cry — Polymarket multi-agent trade suggester.

Usage:
  python main.py --simulate --duration 60     # offline demo, run 60s
  python main.py --simulate --max 3           # offline, stop after 3 suggestions
  python main.py                              # live (Polymarket + CoinGecko public APIs;
                                              #       set COINDESK_API_KEY for real news)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from orchestrator.orchestrator import Orchestrator

CONFIG_PATH = Path(__file__).resolve().parent / "config.json"


def main() -> None:
    parser = argparse.ArgumentParser(description="cry orchestrator")
    parser.add_argument("--simulate", action="store_true", help="run fully offline with synthetic feeds")
    parser.add_argument("--duration", type=float, default=None, help="stop after N seconds")
    parser.add_argument("--max", type=int, default=None, help="stop after N trade suggestions")
    parser.add_argument("--config", default=str(CONFIG_PATH), help="path to config.json")
    args = parser.parse_args()

    config = json.loads(Path(args.config).read_text())
    orchestrator = Orchestrator(config, simulate=args.simulate)
    orchestrator.run(duration_s=args.duration, max_suggestions=args.max)


if __name__ == "__main__":
    main()
