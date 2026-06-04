from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path


def append_log(
    log_path: Path,
    *,
    decision_id: str,
    graph_id: str,
    operation: str,
    summary: str,
) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    entry = (
        f"\n## [{ts}] ingest | {decision_id}\n"
        f"- graph: `{graph_id}`\n"
        f"- operation: `{operation}`\n"
        f"- summary: {summary}\n"
    )
    if log_path.exists():
        log_path.write_text(log_path.read_text(encoding="utf-8") + entry, encoding="utf-8")
    else:
        log_path.write_text("# Wiki Log\n" + entry, encoding="utf-8")


def trade_summary_from_edges(edges: list[dict]) -> str:
    for edge in edges:
        meta = edge.get("metadata") or {}
        if edge.get("Action") and meta.get("thesis"):
            return f"{edge['Action']}: {meta['thesis'][:120]}"
    return "decision ingested"
