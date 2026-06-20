"""Sub-agent registry — orchestrator-owned polling and feed producers."""

from __future__ import annotations

from typing import Any, AsyncIterator

from app.subagents.arbitrage_subagent import (
    stream_arbitrage_signals,
    validate_arbitrage_config,
)
from app.subagents.news_subagent import stream_news_signals, validate_news_config
from app.subagents.risk_analyzer_subagent import stream_risk_signals, validate_risk_config


def agent_feed_id(agent_id: str) -> str:
    return agent_id


async def _stream_risk(config: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    async for signal in stream_risk_signals(config):
        yield signal


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
        "validateConfig": validate_news_config,
        "streamSignals": _stream_news,
    },
    "arbitrageAgent": {
        "id": "arbitrageAgent",
        "nodeType": "arbitrageAgent",
        "category": "subagent",
        "eventType": "arbitrage.signal",
        "validateConfig": validate_arbitrage_config,
        "streamSignals": _stream_arbitrage,
    },
    "riskAnalyzer": {
        "id": "riskAnalyzer",
        "nodeType": "riskAnalyzer",
        "category": "subagent",
        "eventType": "risk.signal",
        "validateConfig": validate_risk_config,
        "streamSignals": _stream_risk,
    },
}


def get_sub_agent(agent_id: str) -> dict[str, Any] | None:
    return SUB_AGENT_REGISTRY.get(agent_id)


def get_signal_producer(agent_id: str) -> dict[str, Any] | None:
    return SUB_AGENT_REGISTRY.get(agent_id)
