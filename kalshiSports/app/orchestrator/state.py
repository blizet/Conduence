"""Shared LangGraph state for the Kalshi sports scanner orchestrator."""

from __future__ import annotations

from typing import Any, TypedDict


class ScannerState(TypedDict, total=False):
    signal: dict[str, Any]            # the market_tick being processed
    config: dict[str, Any]            # strategy thresholds + sizing
    route: str                        # evaluate_entry | manage_position | context_only
    open_positions: dict[str, Any]    # ticker -> position dict (carried between runs)
    bankroll_usd: float
    filter_report: list[str]          # pass/fail trail from the entry gate
    decision: dict[str, Any] | None   # ENTER / SKIP / HOLD / STOP_OUT / SETTLE_WIN / SETTLE_LOSS
    trade_event: dict[str, Any] | None  # what gets appended to out/trades.jsonl
    published: bool
    steps: list[str]
