"""Sub-agent registry — orchestrator-owned polling and feed producers."""

from __future__ import annotations

from typing import Any, AsyncIterator

from app.signal_registry import agent_feed_topic
from app.subagents.arbitrage_subagent import (
    stream_arbitrage_signals,
    validate_arbitrage_config,
)
from app.subagents.news_subagent import stream_news_signals, validate_news_config


async def _stream_news(config: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    async for signal in stream_news_signals(config):
        yield signal


async def _stream_arbitrage(config: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    async for signal in stream_arbitrage_signals(config):
        yield signal


SUB_AGENT_REGISTRY: dict[str, dict[str, Any]] = {
    "newsAgent": {
        "id": "newsAgent",
        "nodeType": "newsAgent",
        "category": "subagent",
        "eventType": "news.signal",
        "feedTopic": agent_feed_topic("newsAgent"),
        "validateConfig": validate_news_config,
        "streamSignals": _stream_news,
    },
    "arbitrageAgent": {
        "id": "arbitrageAgent",
        "nodeType": "arbitrageAgent",
        "category": "subagent",
        "eventType": "arbitrage.signal",
        "feedTopic": agent_feed_topic("arbitrageAgent"),
        "validateConfig": validate_arbitrage_config,
        "streamSignals": _stream_arbitrage,
    },
}


def get_sub_agent(agent_id: str) -> dict[str, Any] | None:
    return SUB_AGENT_REGISTRY.get(agent_id)


def list_sub_agent_feed_topics() -> list[str]:
    return [defn["feedTopic"] for defn in SUB_AGENT_REGISTRY.values()]
