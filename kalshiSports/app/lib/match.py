"""Match a Kalshi soccer market to an API-Football live fixture by team names."""

from __future__ import annotations

import re
from typing import Any

# common club-name noise words that differ between feeds
_NOISE = {
    "fc", "cf", "afc", "sc", "ac", "as", "ss", "us", "club", "de", "the",
    "united", "city", "town", "real", "athletic", "atletico", "sporting",
}


def normalize_team(name: str) -> set[str]:
    words = re.sub(r"[^a-z0-9 ]", " ", name.lower()).split()
    core = {w for w in words if w not in _NOISE and len(w) > 2}
    return core or set(words)


def team_in_text(team: str, text: str) -> bool:
    tokens = normalize_team(team)
    if not tokens:
        return False
    text_words = set(re.sub(r"[^a-z0-9 ]", " ", text.lower()).split())
    return len(tokens & text_words) >= max(1, len(tokens) - 1)


def market_fixture_pair(market: dict[str, Any], fixtures: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Return {fixture, side_team} if the market maps onto a live fixture.

    side_team = the team whose win the YES contract pays on (from yes_sub_title
    or the market title).
    """
    label = f"{market.get('yes_sub_title') or ''} {market.get('title') or ''}"
    for fx in fixtures:
        home, away = fx.get("home", ""), fx.get("away", "")
        if not (team_in_text(home, label) or team_in_text(away, label)):
            continue
        # both teams should appear somewhere in the market title for a game market
        title = market.get("title") or ""
        if not (team_in_text(home, title) and team_in_text(away, title)):
            continue
        side = market.get("yes_sub_title") or ""
        side_team = home if team_in_text(home, side) else away if team_in_text(away, side) else ""
        if not side_team:
            continue
        return {"fixture": fx, "side_team": side_team}
    return None
