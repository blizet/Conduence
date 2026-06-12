"""External (wrapper) mind agents — publishers run their own process; platform ingests only."""

from __future__ import annotations

from typing import Any

DEFAULT_PUBLISHER = "user_demo"
SPORTS_SCANNER_AGENT_ID = f"sportsScanner.{DEFAULT_PUBLISHER}"


def agent_feed_topic(agent_id: str) -> str:
    return f"agent.feeds.{agent_id}.public"


EXTERNAL_AGENT_REGISTRY: dict[str, dict[str, Any]] = {
    SPORTS_SCANNER_AGENT_ID: {
        "id": SPORTS_SCANNER_AGENT_ID,
        "eventType": "market_tick.signal",
        "feedTopic": agent_feed_topic(SPORTS_SCANNER_AGENT_ID),
        "agentPath": "kalshiSports",
        "staleAfterSeconds": 45,
        "signalSchema": {
            "type": "object",
            "required": ["type", "ts"],
            "properties": {
                "type": {"enum": ["market_tick", "trade_enter", "trade_exit"]},
                "agent": {"type": "string"},
                "ticker": {"type": "string"},
                "thesis": {"type": "string"},
                "summary": {"type": "string"},
                "filter_report": {"type": "array", "items": {"type": "string"}},
                "ts": {"type": "string", "format": "date-time"},
            },
        },
    },
}

EXTERNAL_MARKETPLACE_ENTRIES: list[dict[str, Any]] = [
    {
        "id": SPORTS_SCANNER_AGENT_ID,
        "nodeType": "sportsScanner",
        "name": "Kalshi Sports Scanner",
        "description": "Late-game Kalshi soccer paper trades — external publisher via HTTP wrapper",
        "autonomous": True,
        "hosted": False,
        "source": "external",
        "publisher": DEFAULT_PUBLISHER,
        "accent": "#4ade80",
        "feedTopic": agent_feed_topic(SPORTS_SCANNER_AGENT_ID),
        "eventType": "market_tick.signal",
        "agentPath": "kalshiSports",
    },
]


def get_external_agent(agent_id: str) -> dict[str, Any] | None:
    return EXTERNAL_AGENT_REGISTRY.get(agent_id)


def list_external_feed_topics() -> list[str]:
    return [defn["feedTopic"] for defn in EXTERNAL_AGENT_REGISTRY.values()]
