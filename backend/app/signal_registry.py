"""Signal producer registry — mind agents (agents/) + sub-agents + external wrappers."""

from __future__ import annotations

from typing import Any, AsyncIterator

from app.external_agents.registry import (
    EXTERNAL_MARKETPLACE_ENTRIES,
    get_external_agent,
    list_external_feed_topics,
)
from app.mind_agents.loader import get_arbitrage_agent, get_news_agent


def agent_feed_topic(agent_id: str) -> str:
    return f"agent.feeds.{agent_id}.public"


async def _validate_news_config(config: dict[str, Any]) -> None:
    from app.config import COINDESK_API_KEY

    if config.get("simulate"):
        return

    key = (config.get("apiKey") or "").strip() or COINDESK_API_KEY
    if not key:
        raise ValueError(
            "CoinDesk API key required — set apiKey, COINDESK_API_KEY in backend/.env, "
            "pass apiKey when starting, or start with simulate=true"
        )
    await get_news_agent().poll_once(key, config.get("limit", 20))


async def _stream_news_signals(config: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    from app.config import COINDESK_API_KEY

    key = (config.get("apiKey") or "").strip() or COINDESK_API_KEY
    limit = config.get("limit", 20)
    simulate = bool(config.get("simulate"))
    async for signal in get_news_agent().stream_news_signals(key, limit, simulate=simulate):
        yield signal


async def _validate_arbitrage_config(config: dict[str, Any]) -> None:
    return


async def _stream_arbitrage_signals(config: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    simulate = bool(config.get("simulate"))
    async for event in get_arbitrage_agent().stream_arbitrage_signals(simulate=simulate):
        yield event


AUTONOMOUS_AGENT_REGISTRY: dict[str, dict[str, Any]] = {
    "newsAgent": {
        "id": "newsAgent",
        "eventType": "news.signal",
        "feedTopic": agent_feed_topic("newsAgent"),
        "agentPath": "agents/newsAgent",
        "validateConfig": _validate_news_config,
        "streamSignals": _stream_news_signals,
    },
    "arbitrageAgent": {
        "id": "arbitrageAgent",
        "eventType": "arbitrage.signal",
        "feedTopic": agent_feed_topic("arbitrageAgent"),
        "agentPath": "agents/arbitrageAgent",
        "validateConfig": _validate_arbitrage_config,
        "streamSignals": _stream_arbitrage_signals,
    },
}

_HOSTED_MARKETPLACE_CATALOG = [
    {
        "id": "llm",
        "nodeType": "llm",
        "name": "LLM Analyzer",
        "description": "LangGraph orchestrator — synthesizes feeds, tools, and graph into trade decisions",
        "autonomous": False,
        "hosted": True,
        "source": "hosted",
        "accent": "#f472b6",
        "core": True,
    },
    {
        "id": "newsAgent",
        "nodeType": "newsAgent",
        "name": "News Agent",
        "description": "Autonomous CoinDesk feed → dedicated Redpanda topic for subscribers",
        "autonomous": True,
        "hosted": True,
        "source": "hosted",
        "accent": "#fb923c",
        "feedTopic": agent_feed_topic("newsAgent"),
        "eventType": "news.signal",
        "agentPath": "agents/newsAgent",
    },
    {
        "id": "arbitrageAgent",
        "nodeType": "arbitrageAgent",
        "name": "Arbitrage Agent",
        "description": "Polymarket x Kalshi cross-platform arb scanner — fee-aware net edge after all gates",
        "autonomous": True,
        "hosted": True,
        "source": "hosted",
        "accent": "#c084fc",
        "feedTopic": agent_feed_topic("arbitrageAgent"),
        "eventType": "arbitrage.signal",
        "agentPath": "agents/arbitrageAgent",
    },
    {
        "id": "whaleWallet",
        "nodeType": "whaleWallet",
        "name": "Whale Wallet",
        "description": "Polls proxy wallets — emits whale signals when new trades appear (snap Polymarket Wallet tool)",
        "autonomous": True,
        "hosted": True,
        "source": "hosted",
        "category": "subagent",
        "accent": "#38bdf8",
        "feedTopic": agent_feed_topic("whaleWallet"),
        "eventType": "whale.signal",
        "agentPath": "backend/app/subagents/whale_subagent.py",
    },
    {
        "id": "divergenceAgent",
        "nodeType": "divergenceAgent",
        "name": "Divergence Agent",
        "description": "Watches graph asset pairs for correlation decoupling (snap CoinGecko + Divergence tools)",
        "autonomous": True,
        "hosted": True,
        "source": "hosted",
        "category": "subagent",
        "accent": "#e879f9",
        "feedTopic": agent_feed_topic("divergenceAgent"),
        "eventType": "divergence.signal",
        "agentPath": "backend/app/subagents/divergence_subagent.py",
    },
]

MARKETPLACE_CATALOG = [*_HOSTED_MARKETPLACE_CATALOG, *EXTERNAL_MARKETPLACE_ENTRIES]


def is_external_agent(agent_id: str) -> bool:
    return get_external_agent(agent_id) is not None


def is_hosted_agent(agent_id: str) -> bool:
    return get_signal_producer(agent_id) is not None and not is_external_agent(agent_id)


def get_marketplace_agent(agent_id: str) -> dict[str, Any] | None:
    return get_external_agent(agent_id) or get_signal_producer(agent_id)


def get_autonomous_agent(agent_id: str) -> dict[str, Any] | None:
    return AUTONOMOUS_AGENT_REGISTRY.get(agent_id)


def list_autonomous_agent_feed_topics() -> list[str]:
    return [defn["feedTopic"] for defn in AUTONOMOUS_AGENT_REGISTRY.values()]


def get_signal_producer(agent_id: str) -> dict[str, Any] | None:
    from app.subagents.registry import get_sub_agent

    return get_autonomous_agent(agent_id) or get_sub_agent(agent_id)


def list_signal_producer_feed_topics() -> list[str]:
    from app.subagents.registry import list_sub_agent_feed_topics

    return [
        *list_autonomous_agent_feed_topics(),
        *list_sub_agent_feed_topics(),
        *list_external_feed_topics(),
    ]
