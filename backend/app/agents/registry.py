from typing import Any, AsyncIterator, Callable, Awaitable

from app.agents.news_agent import news_agent


def agent_feed_topic(agent_id: str) -> str:
    return f"agent.feeds.{agent_id}.public"


async def _validate_news_config(config: dict[str, Any]) -> None:
    from app.config import COINDESK_API_KEY

    key = (config.get("apiKey") or "").strip() or COINDESK_API_KEY
    if not key:
        raise ValueError(
            "CoinDesk API key required — set apiKey, COINDESK_API_KEY in backend/.env, or pass apiKey when starting"
        )
    await news_agent.poll_once(key, config.get("limit", 20))


async def _stream_news_signals(config: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    from app.config import COINDESK_API_KEY

    key = (config.get("apiKey") or "").strip() or COINDESK_API_KEY
    limit = config.get("limit", 20)
    async for signal in news_agent.stream_news_signals(key, limit):
        yield signal


AUTONOMOUS_AGENT_REGISTRY: dict[str, dict[str, Any]] = {
    "newsAgent": {
        "id": "newsAgent",
        "eventType": "news.signal",
        "feedTopic": agent_feed_topic("newsAgent"),
        "validateConfig": _validate_news_config,
        "streamSignals": _stream_news_signals,
    },
}

MARKETPLACE_CATALOG = [
    {
        "id": "llm",
        "nodeType": "llm",
        "name": "LLM Analyzer",
        "description": "Main inference — synthesizes feeds into trade decisions",
        "autonomous": False,
        "accent": "#f472b6",
        "core": True,
    },
    {
        "id": "newsAgent",
        "nodeType": "newsAgent",
        "name": "News Agent",
        "description": "Autonomous CoinDesk feed → dedicated Redpanda topic for subscribers",
        "autonomous": True,
        "accent": "#fb923c",
        "feedTopic": agent_feed_topic("newsAgent"),
        "eventType": "news.signal",
    },
]


def get_autonomous_agent(agent_id: str) -> dict[str, Any] | None:
    return AUTONOMOUS_AGENT_REGISTRY.get(agent_id)


def list_autonomous_agent_feed_topics() -> list[str]:
    return [defn["feedTopic"] for defn in AUTONOMOUS_AGENT_REGISTRY.values()]
