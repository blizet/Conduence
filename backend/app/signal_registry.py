"""Signal producer registry — sub-agents + external wrappers."""

from __future__ import annotations

from typing import Any

from app.external_agents.registry import (
    EXTERNAL_MARKETPLACE_ENTRIES,
    get_external_agent,
    list_external_feed_topics,
)


def agent_feed_topic(agent_id: str) -> str:
    return f"agent.feeds.{agent_id}.public"


_HOSTED_MARKETPLACE_CATALOG = [
    {
        "id": "llm",
        "nodeType": "llm",
        "name": "Orchestrator",
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
        "category": "subagent",
        "accent": "#fb923c",
        "feedTopic": agent_feed_topic("newsAgent"),
        "eventType": "news.signal",
        "agentPath": "backend/app/subagents/news_subagent.py",
    },
    {
        "id": "arbitrageAgent",
        "nodeType": "arbitrageAgent",
        "name": "Arbitrage Agent",
        "description": "Polymarket x Kalshi cross-platform arb scanner — fee-aware net edge after all gates",
        "autonomous": True,
        "hosted": True,
        "source": "hosted",
        "category": "subagent",
        "accent": "#c084fc",
        "feedTopic": agent_feed_topic("arbitrageAgent"),
        "eventType": "arbitrage.signal",
        "agentPath": "backend/app/subagents/arbitrage_subagent.py",
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
    from app.subagents.registry import get_sub_agent

    return get_sub_agent(agent_id)


def list_autonomous_agent_feed_topics() -> list[str]:
    from app.subagents.registry import list_sub_agent_feed_topics

    return list_sub_agent_feed_topics()


def get_signal_producer(agent_id: str) -> dict[str, Any] | None:
    from app.subagents.registry import get_sub_agent

    return get_sub_agent(agent_id)


def list_signal_producer_feed_topics() -> list[str]:
    from app.subagents.registry import list_sub_agent_feed_topics

    return [
        *list_sub_agent_feed_topics(),
        *list_external_feed_topics(),
    ]
