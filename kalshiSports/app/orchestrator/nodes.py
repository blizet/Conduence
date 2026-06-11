"""LangGraph node functions for the Kalshi sports scanner orchestrator."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.orchestrator.decision_engine import evaluate_entry as gate_entry
from app.orchestrator.decision_engine import manage_position as run_position
from app.orchestrator.state import ScannerState

OUT_FILE = Path(__file__).resolve().parents[2] / "out" / "trades.jsonl"


def _append_step(state: ScannerState, name: str) -> list[str]:
    steps = list(state.get("steps") or [])
    steps.append(name)
    return steps


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def ingest_tick(state: ScannerState) -> dict[str, Any]:
    signal = dict(state.get("signal") or {})
    signal.setdefault("type", "market_tick")
    signal.setdefault("ticker", "")
    return {
        "signal": signal,
        "open_positions": state.get("open_positions") or {},
        "filter_report": [],
        "trade_event": None,
        "published": False,
        "steps": _append_step(state, "ingest_tick"),
    }


def route_tick(state: ScannerState) -> str:
    signal = state.get("signal") or {}
    ticker = signal.get("ticker") or ""
    if ticker in (state.get("open_positions") or {}):
        return "manage_position"
    if signal.get("settled"):
        return "context_only"  # settled market we never held
    return "evaluate_entry"


async def evaluate_entry(state: ScannerState) -> dict[str, Any]:
    decision, report = gate_entry(
        state.get("signal") or {},
        state.get("config") or {},
        state.get("open_positions") or {},
    )
    return {
        "decision": decision,
        "filter_report": report,
        "steps": _append_step(state, "evaluate_entry"),
    }


def route_entry(state: ScannerState) -> str:
    decision = state.get("decision") or {}
    return "enter_position" if decision.get("action") == "ENTER" else "context_only"


async def enter_position(state: ScannerState) -> dict[str, Any]:
    signal = state.get("signal") or {}
    decision = dict(state.get("decision") or {})
    ticker = signal.get("ticker") or ""

    position = {
        "ticker": ticker,
        "title": signal.get("title", ""),
        "side_team": decision.get("side_team", ""),
        "contracts": decision.get("contracts", 0),
        "entry_price_cents": decision.get("entry_price_cents"),
        "cost_usd": decision.get("cost_usd"),
        "fee_usd": decision.get("fee_usd"),
        "entered_at": _now(),
        "entry_game": signal.get("game"),
    }
    open_positions = dict(state.get("open_positions") or {})
    open_positions[ticker] = position

    trade_event = {
        "event": "ENTER",
        "paper": True,
        **position,
        "filter_report": state.get("filter_report") or [],
        "ts": _now(),
    }
    return {
        "open_positions": open_positions,
        "trade_event": trade_event,
        "steps": _append_step(state, "enter_position"),
    }


async def manage_position(state: ScannerState) -> dict[str, Any]:
    signal = state.get("signal") or {}
    ticker = signal.get("ticker") or ""
    open_positions = dict(state.get("open_positions") or {})
    position = open_positions.get(ticker) or {}

    decision = run_position(signal, position, state.get("config") or {})
    updates: dict[str, Any] = {"decision": decision, "steps": _append_step(state, "manage_position")}

    if decision.get("action") in ("STOP_OUT", "SETTLE_WIN", "SETTLE_LOSS"):
        open_positions.pop(ticker, None)
        updates["open_positions"] = open_positions
        updates["bankroll_usd"] = round(float(state.get("bankroll_usd") or 0.0) + float(decision.get("pnl_usd") or 0.0), 2)
        updates["trade_event"] = {
            "event": decision["action"],
            "paper": True,
            "ticker": ticker,
            "title": position.get("title", ""),
            "side_team": position.get("side_team", ""),
            "contracts": decision.get("contracts"),
            "entry_price_cents": position.get("entry_price_cents"),
            "exit_price_cents": decision.get("exit_price_cents"),
            "pnl_usd": decision.get("pnl_usd"),
            "reason": decision.get("reason", ""),
            "held_from": position.get("entered_at"),
            "ts": _now(),
        }
    return updates


async def context_only(state: ScannerState) -> dict[str, Any]:
    decision = state.get("decision") or {"action": "SKIP", "reasons": state.get("filter_report") or []}
    return {
        "decision": decision,
        "published": False,
        "steps": _append_step(state, "context_only"),
    }


async def publish_outputs(state: ScannerState) -> dict[str, Any]:
    trade_event = state.get("trade_event")
    if trade_event:
        OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
        with OUT_FILE.open("a") as f:
            f.write(json.dumps(trade_event) + "\n")

        print("\n" + "=" * 72)
        print(f"PAPER {trade_event['event']}  {trade_event['ticker']}  ({trade_event.get('side_team', '')})")
        if trade_event["event"] == "ENTER":
            print(f"  {trade_event['contracts']} contracts @ {trade_event['entry_price_cents']}c"
                  f"  cost ${trade_event['cost_usd']:,.2f}  fee ${trade_event['fee_usd']:.2f}")
            for line in trade_event.get("filter_report", []):
                print(f"    - {line}")
        else:
            print(f"  exit @ {trade_event.get('exit_price_cents')}c"
                  f"  pnl ${trade_event.get('pnl_usd', 0):+,.2f}"
                  + (f"  ({trade_event['reason']})" if trade_event.get("reason") else ""))
        print("=" * 72)

    return {"published": bool(trade_event), "steps": _append_step(state, "publish_outputs")}
