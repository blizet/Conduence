"""Sub-agent registry — same feed contract as mind agents, orchestrator-owned polling."""

from __future__ import annotations

from typing import Any, AsyncIterator

from app.signal_registry import agent_feed_topic
from app.subagents.divergence_subagent import stream_divergence_signals
from app.subagents.whale_subagent import stream_whale_signals


async def _validate_whale_config(config: dict[str, Any]) -> None:
    if config.get("simulate"):
        return
    wallets = [w.strip() for w in (config.get("walletAddresses") or []) if w.strip()]
    if not wallets:
        raise ValueError("walletAddresses required on Whale Wallet sub-agent node")


async def _stream_whale(config: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    async for signal in stream_whale_signals(config):
        yield signal


async def _validate_divergence_config(config: dict[str, Any]) -> None:
    if config.get("simulate"):
        return
    # Live mode needs graph pairs — validated on first poll cycle.
    return


async def _stream_divergence(config: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    async for signal in stream_divergence_signals(config):
        yield signal


SUB_AGENT_REGISTRY: dict[str, dict[str, Any]] = {
    "whaleWallet": {
        "id": "whaleWallet",
        "nodeType": "whaleWallet",
        "category": "subagent",
        "eventType": "whale.signal",
        "feedTopic": agent_feed_topic("whaleWallet"),
        "requiredTools": ["polymarketWallet"],
        "validateConfig": _validate_whale_config,
        "streamSignals": _stream_whale,
    },
    "divergenceAgent": {
        "id": "divergenceAgent",
        "nodeType": "divergenceAgent",
        "category": "subagent",
        "eventType": "divergence.signal",
        "feedTopic": agent_feed_topic("divergenceAgent"),
        "requiredTools": ["coingecko", "divergence"],
        "validateConfig": _validate_divergence_config,
        "streamSignals": _stream_divergence,
    },
}


def get_sub_agent(agent_id: str) -> dict[str, Any] | None:
    return SUB_AGENT_REGISTRY.get(agent_id)


def list_sub_agent_feed_topics() -> list[str]:
    return [defn["feedTopic"] for defn in SUB_AGENT_REGISTRY.values()]
