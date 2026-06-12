"""HTTP wrapper — emit signals from kalshiSports to the CoT_kb platform (any language can mirror this)."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env", override=False)

API_URL = os.getenv("COT_API_URL", "http://localhost:4000").rstrip("/")
AGENT_ID = os.getenv("COT_AGENT_ID", "sportsScanner.user_demo")
PUBLISHER_KEY = os.getenv("COT_PUBLISHER_KEY", "cot-dev-wrapper-key")
ENABLED = os.getenv("COT_WRAPPER_ENABLED", "1").strip().lower() not in ("0", "false", "no", "off")
TIMEOUT_S = float(os.getenv("COT_WRAPPER_TIMEOUT_S", "10"))


def wrapper_enabled() -> bool:
    return ENABLED and bool(AGENT_ID) and bool(PUBLISHER_KEY)


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {PUBLISHER_KEY}",
        "Content-Type": "application/json",
    }


def emit_signal(payload: dict[str, Any]) -> bool:
    """POST a signal to the platform feed. Returns True on success."""
    if not wrapper_enabled():
        return False
    try:
        with httpx.Client(timeout=TIMEOUT_S) as client:
            res = client.post(
                f"{API_URL}/api/feeds/{AGENT_ID}/signal",
                json={"payload": payload},
                headers=_headers(),
            )
            res.raise_for_status()
        return True
    except Exception as exc:
        print(f"[cot_wrapper] signal emit failed: {exc}")
        return False


def emit_heartbeat() -> bool:
    if not wrapper_enabled():
        return False
    try:
        with httpx.Client(timeout=TIMEOUT_S) as client:
            res = client.post(
                f"{API_URL}/api/feeds/{AGENT_ID}/heartbeat",
                headers=_headers(),
            )
            res.raise_for_status()
        return True
    except Exception as exc:
        print(f"[cot_wrapper] heartbeat failed: {exc}")
        return False


def trade_event_to_signal(trade_event: dict[str, Any]) -> dict[str, Any]:
    """Map a kalshiSports trade event to a platform signal payload."""
    event = trade_event.get("event", "")
    ticker = trade_event.get("ticker", "")
    side = trade_event.get("side_team", "")
    filters = trade_event.get("filter_report") or []

    if event == "ENTER":
        thesis = (
            f"Late-game Kalshi entry: {side} @ {trade_event.get('entry_price_cents')}c "
            f"on {ticker}"
        )
        return {
            "type": "trade_enter",
            "agent": "sportsScanner",
            "ticker": ticker,
            "title": trade_event.get("title", ""),
            "side_team": side,
            "thesis": thesis,
            "summary": thesis,
            "filter_report": filters,
            "contracts": trade_event.get("contracts"),
            "entry_price_cents": trade_event.get("entry_price_cents"),
            "cost_usd": trade_event.get("cost_usd"),
            "paper": True,
            "ts": trade_event.get("ts"),
        }

    reason = trade_event.get("reason", "")
    return {
        "type": "trade_exit",
        "agent": "sportsScanner",
        "ticker": ticker,
        "title": trade_event.get("title", ""),
        "side_team": side,
        "event": event,
        "thesis": reason or f"{event} on {ticker}",
        "summary": reason or f"{event} on {ticker}",
        "pnl_usd": trade_event.get("pnl_usd"),
        "exit_price_cents": trade_event.get("exit_price_cents"),
        "paper": True,
        "ts": trade_event.get("ts"),
    }
