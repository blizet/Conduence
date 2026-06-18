"""One-off: expand macro agentic graph with Totalis correlated markets."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agentic.totalis_expand import (
    DEFAULT_CATEGORIES,
    expand_macro_graph_file,
    tighten_agentic_graph_file,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Expand macro agentic graph from Totalis API")
    parser.add_argument(
        "--path",
        default="",
        help="Path to macro_correlation_graph.json (default: data/agentic/macro_correlation_graph.json)",
    )
    parser.add_argument(
        "--pages",
        type=int,
        default=8,
        help="Max API pages per category (default: 8)",
    )
    parser.add_argument(
        "--categories",
        default=",".join(DEFAULT_CATEGORIES),
        help="Comma-separated Totalis categories",
    )
    parser.add_argument(
        "--tighten",
        action="store_true",
        help="Only add macro bridge edges so Totalis nodes connect to the macro graph",
    )
    args = parser.parse_args()
    macro_path = Path(args.path) if args.path else None

    if args.tighten:
        result = tighten_agentic_graph_file(macro_path)
    else:
        categories = tuple(c.strip() for c in args.categories.split(",") if c.strip())
        result = expand_macro_graph_file(
            macro_path,
            categories=categories,
            pages_per_category=max(1, args.pages),
        )

    print("Expanded:", result["path"])
    print("Stats:", result.get("stats"))
    print("Total nodes:", result.get("totalNodes"), "edges:", result.get("totalEdges"))


if __name__ == "__main__":
    main()
