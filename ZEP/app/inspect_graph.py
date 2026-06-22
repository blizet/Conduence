"""
Dumps a user's current graph (nodes + edges) for debugging -- useful to
see what's actually been extracted from your conversations so far.

Usage:
    python scripts/inspect_graph.py --user-id alice
"""
from __future__ import annotations

import argparse

from config import load_settings
from zep_client import build_client


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect a user's Zep graph.")
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()

    settings = load_settings()
    client = build_client(settings)

    print(f"=== Nodes for user '{args.user_id}' ===")
    nodes = client.graph.node.get_by_user_id(user_id=args.user_id, limit=args.limit)
    if not nodes:
        print("  (none yet)")
    for node in nodes:
        labels = ", ".join(node.labels or [])
        print(f"- [{labels}] {node.name}")
        if node.summary:
            print(f"    summary: {node.summary}")
        if node.attributes:
            for key, value in node.attributes.items():
                print(f"    {key}: {value}")

    print(f"\n=== Edges for user '{args.user_id}' ===")
    edges = client.graph.edge.get_by_user_id(user_id=args.user_id, limit=args.limit)
    if not edges:
        print("  (none yet)")
    for edge in edges:
        print(f"- ({edge.name}) {edge.fact}")
        if edge.attributes:
            for key, value in edge.attributes.items():
                print(f"    {key}: {value}")

    print(f"\nTotal: {len(nodes)} node(s), {len(edges)} edge(s)")


if __name__ == "__main__":
    main()
