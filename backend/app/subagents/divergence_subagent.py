"""Divergence sub-agent — polls graph asset pairs for correlation decoupling.

Ported from cry/subAgents/divergence_agent.py. Snapped tools: coingecko + divergence
(canvas edges: CoinGecko → Divergence SubAgent, Divergence tool → Divergence SubAgent).
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from app.orchestrator.correlation_graph import CorrelationGraph, DEFAULT_GRAPH_PATH
from app.tools.coingecko import fetch_coingecko

DIVERGENCE_THRESHOLD = 3.0
DEFAULT_POLL_S = float(os.getenv("DIVERGENCE_SUBAGENT_POLL_S", "60"))


def _compute_divergence(
    base_change: float,
    other_change: float,
    expected_corr: float,
    base_id: str,
    other_id: str,
) -> dict[str, Any]:
    expected_other = base_change * expected_corr
    gap = other_change - expected_other
    diverging = abs(gap) >= DIVERGENCE_THRESHOLD
    direction = "above" if gap > 0 else "below"
    note = (
        f"{other_id} moved {other_change:+.1f}% vs expected {expected_other:+.1f}% "
        f"(corr {expected_corr:+.2f} with {base_id} which moved {base_change:+.1f}%) — "
        f"{abs(gap):.1f}pp {direction} expectation"
    )
    return {
        "diverging": diverging,
        "gap_pp": round(gap, 2),
        "expected_change": round(expected_other, 2),
        "actual_change": round(other_change, 2),
        "note": note,
    }


def _signal_from_verdict(base_id: str, other_id: str, verdict: dict[str, Any]) -> dict[str, Any]:
    direction = "bullish" if verdict["gap_pp"] > 0 else "bearish"
    strength = min(1.0, abs(verdict["gap_pp"]) / 10.0)
    return {
        "type": "divergence",
        "agent": "divergenceAgent",
        "keywords": [other_id, base_id],
        "direction": direction,
        "strength": round(strength, 3),
        "summary": verdict["note"],
        "data": {"pair": [base_id, other_id], "verdict": verdict},
        "ts": datetime.now(timezone.utc).isoformat(),
    }


async def stream_divergence_signals(config: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    graph_path = config.get("graphPath") or str(DEFAULT_GRAPH_PATH)
    graph = CorrelationGraph(graph_path)
    poll_s = float(config.get("pollIntervalS") or DEFAULT_POLL_S)
    simulate = bool(config.get("simulate"))

    pairs = [
        (e.source, e.target, e.weight)
        for e in graph.edges
        if graph.nodes.get(e.source) is not None
        and graph.nodes.get(e.target) is not None
        and graph.nodes[e.source].coingecko_id
        and graph.nodes[e.target].coingecko_id
    ]

    if simulate:
        while True:
            yield _signal_from_verdict(
                "bitcoin",
                "zcash",
                _compute_divergence(0.5, 12.0, 0.35, "bitcoin", "zcash"),
            )
            await asyncio.sleep(poll_s)
        return

    if not pairs:
        raise ValueError("Correlation graph has no coingecko-linked asset pairs to watch")

    while True:
        ids = sorted({graph.nodes[n].coingecko_id for pair in pairs for n in pair[:2] if graph.nodes[n].coingecko_id})
        price_result = await fetch_coingecko({"ids": ids})
        if not price_result.get("ok"):
            await asyncio.sleep(poll_s)
            continue

        prices = price_result.get("data", {}).get("prices", {})
        for base_id, other_id, weight in pairs:
            base_cg = graph.nodes[base_id].coingecko_id
            other_cg = graph.nodes[other_id].coingecko_id
            if not base_cg or not other_cg:
                continue
            base_info = prices.get(base_cg) or {}
            other_info = prices.get(other_cg) or {}
            base_chg = base_info.get("usd_24h_change", 0.0) or 0.0
            other_chg = other_info.get("usd_24h_change", 0.0) or 0.0
            verdict = _compute_divergence(base_chg, other_chg, weight, base_id, other_id)
            if verdict["diverging"]:
                yield _signal_from_verdict(base_id, other_id, verdict)

        await asyncio.sleep(poll_s)
