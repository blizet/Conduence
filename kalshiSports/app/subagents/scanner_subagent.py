"""Sports scanner sub-agent — streams in-play Kalshi soccer market ticks.

Same pattern as backend/app/subagents/whale_subagent.py: an async generator
that yields signal dicts. Each tick bundles the Kalshi top-of-book with the
matched live game state, so the orchestrator graph has everything it needs
to gate an entry or manage an open position.

Signal contract:
{
  "type": "market_tick",
  "agent": "sportsScanner",
  "ticker": str, "title": str, "side_team": str,
  "book": { "yes_bid": int, "yes_ask": int, "spread": int, "ask_depth": int },
  "game": { "minute": int, "in_play": bool, "finished": bool,
            "home": str, "away": str, "home_goals": int, "away_goals": int,
            "home_reds": int, "away_reds": int, "recent_var": bool },
  "settled": bool, "result": "yes" | "no" | "",
  "summary": str, "ts": iso8601
}
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from app.lib.match import market_fixture_pair
from app.tools.api_football import fetch_live_fixtures
from app.tools.kalshi import fetch_kalshi_markets, fetch_kalshi_orderbook

DEFAULT_POLL_S = 10.0


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _tick(
    *,
    ticker: str,
    title: str,
    side_team: str,
    book: dict[str, Any],
    game: dict[str, Any],
    settled: bool = False,
    result: str = "",
) -> dict[str, Any]:
    score = f"{game.get('home_goals', 0)}-{game.get('away_goals', 0)}"
    summary = (
        f"{ticker} {side_team} ask={book.get('yes_ask')}c bid={book.get('yes_bid')}c "
        f"| {game.get('home')} {score} {game.get('away')} @ {game.get('minute')}'"
        + (f" | SETTLED {result.upper()}" if settled else "")
    )
    return {
        "type": "market_tick",
        "agent": "sportsScanner",
        "ticker": ticker,
        "title": title,
        "side_team": side_team,
        "book": book,
        "game": game,
        "settled": settled,
        "result": result,
        "summary": summary,
        "ts": _now(),
    }


# ---------------------------------------------------------------------------
# Simulated timeline — 3 matches covering the strategy's three outcomes:
#   KXSIM-ARS : passes all filters -> entry -> settles YES (win)
#   KXSIM-RMA : late 1-goal entry  -> equalizer -> bid collapses -> stop-out
#   KXSIM-MUN : price in band but lead too small too early -> rejected
# ---------------------------------------------------------------------------

def _sim_game(home: str, away: str, minute: int, hg: int, ag: int, **kw: Any) -> dict[str, Any]:
    return {
        "minute": minute, "in_play": True, "finished": False,
        "home": home, "away": away, "home_goals": hg, "away_goals": ag,
        "home_reds": 0, "away_reds": 0, "recent_var": False, **kw,
    }


SIMULATED_TIMELINE: list[dict[str, Any]] = [
    # -- rejected: only 1-0 at 81', filters demand lead>=2 before 87'
    _tick(ticker="KXSIM-MUN", title="Manchester United vs Everton Winner?", side_team="Manchester United",
          book={"yes_bid": 92, "yes_ask": 94, "spread": 2, "ask_depth": 400},
          game=_sim_game("Manchester United", "Everton", 81, 1, 0)),
    # -- entry: 2-0 at 82', ask 93c
    _tick(ticker="KXSIM-ARS", title="Arsenal vs Chelsea Winner?", side_team="Arsenal",
          book={"yes_bid": 92, "yes_ask": 93, "spread": 1, "ask_depth": 800},
          game=_sim_game("Arsenal", "Chelsea", 82, 2, 0)),
    # -- entry: 1-0 at 88' (late-minute rule), ask 92c
    _tick(ticker="KXSIM-RMA", title="Real Madrid vs Sevilla Winner?", side_team="Real Madrid",
          book={"yes_bid": 91, "yes_ask": 92, "spread": 1, "ask_depth": 600},
          game=_sim_game("Real Madrid", "Sevilla", 88, 1, 0)),
    # -- hold: Arsenal cruising
    _tick(ticker="KXSIM-ARS", title="Arsenal vs Chelsea Winner?", side_team="Arsenal",
          book={"yes_bid": 95, "yes_ask": 96, "spread": 1, "ask_depth": 900},
          game=_sim_game("Arsenal", "Chelsea", 88, 2, 0)),
    # -- disaster: Sevilla equalize in stoppage time, bid collapses -> stop-out
    _tick(ticker="KXSIM-RMA", title="Real Madrid vs Sevilla Winner?", side_team="Real Madrid",
          book={"yes_bid": 48, "yes_ask": 55, "spread": 7, "ask_depth": 300},
          game=_sim_game("Real Madrid", "Sevilla", 90, 1, 1)),
    # -- settlement: Arsenal win confirmed
    _tick(ticker="KXSIM-ARS", title="Arsenal vs Chelsea Winner?", side_team="Arsenal",
          book={"yes_bid": 99, "yes_ask": 100, "spread": 1, "ask_depth": 0},
          game=_sim_game("Arsenal", "Chelsea", 90, 3, 0, in_play=False, finished=True),
          settled=True, result="yes"),
]


async def _stream_simulated(poll_s: float) -> AsyncIterator[dict[str, Any]]:
    for tick in SIMULATED_TIMELINE:
        tick = dict(tick)
        tick["ts"] = _now()
        yield tick
        await asyncio.sleep(min(poll_s, 1.0))


# ---------------------------------------------------------------------------
# Live mode
# ---------------------------------------------------------------------------

async def _stream_live(config: dict[str, Any], watchlist: set[str], poll_s: float) -> AsyncIterator[dict[str, Any]]:
    series_tickers = [s for s in (config.get("kalshi_series_tickers") or []) if s]
    league_ids = config.get("api_football_league_ids") or []
    watch_floor = int(config.get("entry_ask_min_cents", 92)) - 3  # start watching slightly below band

    while True:
        fixtures_res, *market_batches = await asyncio.gather(
            fetch_live_fixtures({"league_ids": league_ids}),
            *[fetch_kalshi_markets({"series_ticker": s}) for s in (series_tickers or [None])],
        )
        fixtures = (fixtures_res.get("data") or {}).get("fixtures", []) if fixtures_res.get("ok") else []
        live_fixtures = [f for f in fixtures if f.get("in_play") or f.get("finished")]

        markets: list[dict[str, Any]] = []
        for batch in market_batches:
            if batch.get("ok"):
                markets.extend((batch.get("data") or {}).get("markets", []))

        for market in markets:
            ticker = market.get("ticker") or ""
            ask = market.get("yes_ask")
            held = ticker in watchlist
            if not held and (ask is None or ask < watch_floor):
                continue

            pair = market_fixture_pair(market, live_fixtures)
            if pair is None and not held:
                continue

            book_res = await fetch_kalshi_orderbook({"ticker": ticker})
            book = book_res.get("data") or {
                "yes_bid": market.get("yes_bid"), "yes_ask": ask, "spread": None, "ask_depth": 0,
            }

            game = (pair or {}).get("fixture") or {}
            settled = market.get("status") in ("settled", "finalized") or bool(market.get("result"))
            yield _tick(
                ticker=ticker,
                title=market.get("title", ""),
                side_team=(pair or {}).get("side_team", market.get("yes_sub_title", "")),
                book=book,
                game=game,
                settled=settled,
                result=market.get("result", ""),
            )

        await asyncio.sleep(poll_s)


async def stream_market_ticks(config: dict[str, Any], watchlist: set[str]) -> AsyncIterator[dict[str, Any]]:
    """watchlist is a live, mutable set of tickers we hold — the runner keeps
    it in sync with open positions so held markets are always re-ticked."""
    poll_s = float(config.get("scanner_poll_s") or DEFAULT_POLL_S)
    if config.get("simulate"):
        async for tick in _stream_simulated(poll_s):
            yield tick
    else:
        async for tick in _stream_live(config, watchlist, poll_s):
            yield tick
