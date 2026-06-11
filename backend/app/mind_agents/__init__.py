"""Load autonomous mind agents from repo agents/{agentId}/ folders."""

from app.mind_agents.loader import get_arbitrage_agent, get_coindesk_module, get_news_agent

__all__ = ["get_news_agent", "get_arbitrage_agent", "get_coindesk_module"]
