"""API-Football live fixtures tool (https://www.api-football.com, free tier OK).

Needs API_FOOTBALL_KEY env var. Same normalized contract as the other tools.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import httpx

API_FOOTBALL_BASE = os.getenv("API_FOOTBALL_BASE", "https://v3.football.api-sports.io")
TIMEOUT_S = float(os.getenv("API_FOOTBALL_TIMEOUT_S", "10"))

# fixture statuses that mean the ball is in play (2nd half / extra time)
IN_PLAY = {"2H", "ET"}
FINISHED = {"FT", "AET", "PEN"}


def _normalized(*, request: dict[str, Any], data: Any = None, error: str | None = None) -> dict[str, Any]:
    return {
        "ok": error is None,
        "source": "apiFootball",
        "request": request,
        "data": data if error is None else None,
        "error": error,
    }


def _red_cards(events: list[dict[str, Any]], team_name: str) -> int:
    return sum(
        1
        for e in events
        if e.get("type") == "Card"
        and e.get("detail") == "Red Card"
        and (e.get("team") or {}).get("name") == team_name
    )


def _recent_var(events: list[dict[str, Any]], minute: int, window: int = 3) -> bool:
    for e in events:
        if e.get("type") != "Var":
            continue
        at = (e.get("time") or {}).get("elapsed") or 0
        if minute - at <= window:
            return True
    return False


def normalize_fixture(item: dict[str, Any]) -> dict[str, Any]:
    fixture = item.get("fixture") or {}
    status = (fixture.get("status") or {})
    teams = item.get("teams") or {}
    goals = item.get("goals") or {}
    events = item.get("events") or []
    home = (teams.get("home") or {}).get("name", "")
    away = (teams.get("away") or {}).get("name", "")
    minute = int(status.get("elapsed") or 0)
    return {
        "fixture_id": fixture.get("id"),
        "league_id": ((item.get("league") or {}).get("id")),
        "status": status.get("short", ""),
        "in_play": status.get("short") in IN_PLAY,
        "finished": status.get("short") in FINISHED,
        "minute": minute,
        "home": home,
        "away": away,
        "home_goals": int(goals.get("home") or 0),
        "away_goals": int(goals.get("away") or 0),
        "home_reds": _red_cards(events, home),
        "away_reds": _red_cards(events, away),
        "recent_var": _recent_var(events, minute),
        "ts": datetime.now(timezone.utc).isoformat(),
    }


async def fetch_live_fixtures(body: dict[str, Any]) -> dict[str, Any]:
    """body: { "league_ids"?: [int] } — empty means all live fixtures."""
    api_key = os.getenv("API_FOOTBALL_KEY", "")
    league_ids = [int(x) for x in (body.get("league_ids") or [])]
    request = {"league_ids": league_ids}
    if not api_key:
        return _normalized(request=request, error="API_FOOTBALL_KEY missing — set env var or run --simulate")

    params: dict[str, Any] = {"live": "all"}
    if league_ids:
        params["live"] = "-".join(str(i) for i in league_ids)

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            res = await client.get(
                f"{API_FOOTBALL_BASE}/fixtures",
                params=params,
                headers={"x-apisports-key": api_key},
            )
            if res.status_code >= 400:
                return _normalized(request=request, error=f"API-Football failed ({res.status_code}): {res.text[:200]}")
            payload = res.json()
    except Exception as exc:
        return _normalized(request=request, error=str(exc))

    fixtures = [normalize_fixture(item) for item in payload.get("response", [])]
    return _normalized(request=request, data={"fixtures": fixtures})
