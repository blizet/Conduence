"""Token usage tracking for agentic graph LLM calls."""

from __future__ import annotations

from typing import Any, TypedDict


class TurnTokenUsage(TypedDict):
    inputTokens: int
    outputTokens: int
    totalTokens: int
    costUsd: float


class ConversationTokenUsage(TypedDict):
    llmTurns: int
    lastTurn: TurnTokenUsage | None
    session: TurnTokenUsage


def empty_turn_usage() -> TurnTokenUsage:
    return {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0, "costUsd": 0.0}


def empty_conversation_usage() -> ConversationTokenUsage:
    return {"llmTurns": 0, "lastTurn": None, "session": empty_turn_usage()}


def with_cost_usd(usage: dict[str, int], cost_usd: float) -> TurnTokenUsage:
    return {
        "inputTokens": usage.get("inputTokens", 0),
        "outputTokens": usage.get("outputTokens", 0),
        "totalTokens": usage.get("totalTokens", 0),
        "costUsd": cost_usd,
    }


def add_turn_usage(
    current: ConversationTokenUsage,
    turn: TurnTokenUsage | None,
) -> ConversationTokenUsage:
    if not turn:
        return current
    session = current["session"]
    return {
        "llmTurns": current["llmTurns"] + 1,
        "lastTurn": turn,
        "session": {
            "inputTokens": session["inputTokens"] + turn["inputTokens"],
            "outputTokens": session["outputTokens"] + turn["outputTokens"],
            "totalTokens": session["totalTokens"] + turn["totalTokens"],
            "costUsd": session["costUsd"] + turn["costUsd"],
        },
    }


def format_token_count(n: int) -> str:
    return f"{n:,}"
