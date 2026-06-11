"""Entry gating + position management for the late-game strategy.

Pure functions so the LangGraph nodes stay thin and everything is unit-testable.

Entry rule (ALL must pass):
  1. yes_ask within [entry_ask_min_cents, entry_ask_max_cents]
  2. fixture in play, minute >= min_minute
  3. side_team leads by >= min_lead goals
     (or >= late_min_lead after late_minute)
  4. trailing team does NOT have a man advantage
  5. no VAR event in the last few minutes
  6. spread <= max_spread_cents, ask depth covers the intended size
  7. room left: open positions < max_open_positions

Exit rule:
  - market settled  -> SETTLE_WIN (yes) / SETTLE_LOSS (no)
  - yes_bid < stop_bid_cents -> STOP_OUT at the bid
"""

from __future__ import annotations

from typing import Any

from app.lib.fees import taker_fee


def _side_lead(game: dict[str, Any], side_team: str) -> int:
    hg, ag = int(game.get("home_goals") or 0), int(game.get("away_goals") or 0)
    return hg - ag if side_team == game.get("home") else ag - hg


def _man_disadvantage(game: dict[str, Any], side_team: str) -> bool:
    """True when OUR team has fewer players than the trailing opponent."""
    hr, ar = int(game.get("home_reds") or 0), int(game.get("away_reds") or 0)
    our_reds, their_reds = (hr, ar) if side_team == game.get("home") else (ar, hr)
    return our_reds > their_reds


def evaluate_entry(signal: dict[str, Any], config: dict[str, Any], open_positions: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    book = signal.get("book") or {}
    game = signal.get("game") or {}
    side = signal.get("side_team") or ""
    report: list[str] = []
    ok = True

    def gate(passed: bool, label: str) -> None:
        nonlocal ok
        report.append(f"{'PASS' if passed else 'FAIL'} {label}")
        ok = ok and passed

    ask = book.get("yes_ask")
    lo, hi = int(config.get("entry_ask_min_cents", 92)), int(config.get("entry_ask_max_cents", 97))
    gate(ask is not None and lo <= ask <= hi, f"price: ask {ask}c in [{lo},{hi}]c")

    minute = int(game.get("minute") or 0)
    min_minute = int(config.get("min_minute", 80))
    gate(bool(game.get("in_play")) and minute >= min_minute, f"clock: in-play minute {minute} >= {min_minute}")

    lead = _side_lead(game, side)
    min_lead = int(config.get("min_lead", 2))
    late_minute = int(config.get("late_minute", 87))
    late_min_lead = int(config.get("late_min_lead", 1))
    lead_ok = lead >= min_lead or (minute >= late_minute and lead >= late_min_lead)
    gate(lead_ok, f"lead: {side} +{lead} (need >={min_lead}, or >={late_min_lead} after {late_minute}')")

    gate(not _man_disadvantage(game, side), "cards: no man disadvantage")
    gate(not game.get("recent_var"), "var: no recent VAR event")

    spread = book.get("spread")
    max_spread = int(config.get("max_spread_cents", 2))
    gate(spread is not None and spread <= max_spread, f"liquidity: spread {spread}c <= {max_spread}c")

    risk_usd = float(config.get("portfolio_usd", 10_000)) * float(config.get("risk_pct", 0.02))
    contracts = int(risk_usd / (ask / 100.0)) if ask else 0
    depth = int(book.get("ask_depth") or 0)
    gate(contracts > 0 and depth >= contracts, f"depth: {depth} >= {contracts} contracts at ask")

    max_open = int(config.get("max_open_positions", 5))
    gate(len(open_positions) < max_open, f"exposure: {len(open_positions)} open < {max_open}")

    if not ok:
        return {"action": "SKIP", "reasons": report}, report

    price = ask / 100.0
    fee = taker_fee(contracts, price)
    return {
        "action": "ENTER",
        "ticker": signal.get("ticker"),
        "side_team": side,
        "contracts": contracts,
        "entry_price_cents": ask,
        "cost_usd": round(contracts * price, 2),
        "fee_usd": fee,
        "max_profit_usd": round(contracts * (1.0 - price) - fee, 2),
        "reasons": report,
    }, report


def manage_position(signal: dict[str, Any], position: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    book = signal.get("book") or {}
    contracts = int(position.get("contracts") or 0)
    entry_cents = int(position.get("entry_price_cents") or 0)
    cost = contracts * entry_cents / 100.0
    entry_fee = float(position.get("fee_usd") or 0.0)

    if signal.get("settled"):
        won = (signal.get("result") or "").lower() == "yes"
        payout = contracts * 1.0 if won else 0.0
        pnl = round(payout - cost - entry_fee, 2)
        return {"action": "SETTLE_WIN" if won else "SETTLE_LOSS", "exit_price_cents": 100 if won else 0,
                "contracts": contracts, "pnl_usd": pnl}

    bid = book.get("yes_bid")
    stop = int(config.get("stop_bid_cents", 75))
    if bid is not None and bid < stop:
        exit_price = bid / 100.0
        exit_fee = taker_fee(contracts, exit_price)
        pnl = round(contracts * exit_price - cost - entry_fee - exit_fee, 2)
        return {"action": "STOP_OUT", "exit_price_cents": bid, "contracts": contracts,
                "pnl_usd": pnl, "exit_fee_usd": exit_fee,
                "reason": f"bid {bid}c < stop {stop}c"}

    return {"action": "HOLD", "mark_cents": bid, "contracts": contracts}
