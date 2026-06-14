"""Emit CoT from subagent signals when workflow topology is subagent → cotBuilder."""

from __future__ import annotations

import logging
from typing import Any

from app.lib.normalize import normalize_decision
from app.schemas.decision import DecisionEvent
from app.tools.cot_builder import build_cot_decision

logger = logging.getLogger(__name__)


def decision_from_news_signal(signal: dict[str, Any]) -> dict[str, Any]:
    direction = signal.get("direction") or signal.get("sentiment") or "neutral"
    strength = float(signal.get("strength") or 0.5)
    if direction == "bullish" and strength >= 0.55:
        action = "BUY_YES"
    elif direction == "bearish" and strength >= 0.55:
        action = "BUY_NO"
    else:
        action = "HOLD"
    keywords = signal.get("keywords") or []
    market_id = keywords[0] if keywords else "NONE"
    return {
        "action": action,
        "market_id": market_id if action != "HOLD" else "NONE",
        "conviction_level": max(1, min(10, int(round(strength * 10)))),
        "thesis": signal.get("thesis") or signal.get("summary") or signal.get("headline", ""),
        "tags": [f"#{k}" for k in (signal.get("categories") or [])[:3]],
        "reasoning": "; ".join(signal.get("evidence") or [])[:500] or signal.get("thesis", ""),
    }


def decision_from_arbitrage_signal(signal: dict[str, Any]) -> dict[str, Any]:
    opp = signal.get("opportunity") or {}
    legs = signal.get("legs") or {}
    poly = legs.get("polymarket") or {}
    direction = opp.get("direction") or ""
    side = "BUY_YES" if "YES" in str(direction).upper() else "BUY_NO"
    return {
        "action": side,
        "market_id": poly.get("slug") or poly.get("url") or "NONE",
        "market_slug": poly.get("slug", ""),
        "conviction_level": max(1, min(10, int(round(float(opp.get("match_confidence", 0.6)) * 10)))),
        "thesis": signal.get("thesis") or signal.get("summary", ""),
        "tags": ["#arbitrage"],
        "reasoning": signal.get("llm_reasoning") or signal.get("thesis", ""),
    }


def correlated_from_signal(signal: dict[str, Any]) -> dict[str, Any]:
    legs = signal.get("legs") or {}
    pm = legs.get("polymarket") or {}
    kal = legs.get("kalshi") or {}
    markets = []
    if pm.get("slug") or pm.get("title"):
        markets.append(
            {
                "id": pm.get("slug") or pm.get("url"),
                "venue": "polymarket",
                "title": pm.get("title"),
                "slug": pm.get("slug"),
            }
        )
    if kal.get("ticker") or kal.get("title"):
        markets.append(
            {
                "id": kal.get("ticker") or kal.get("url"),
                "venue": "kalshi",
                "title": kal.get("title"),
                "slug": kal.get("ticker"),
            }
        )
    return {"polymarket": markets, "kalshi": [], "correlations": []}


def build_cot_from_signal(
    signal: dict[str, Any],
    *,
    agent_id: str,
    output_node_data: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    output_node_data = output_node_data or {}
    if agent_id == "newsAgent":
        decision = decision_from_news_signal(signal)
    elif agent_id == "arbitrageAgent":
        decision = decision_from_arbitrage_signal(signal)
    else:
        decision = {
            "action": "HOLD",
            "market_id": "NONE",
            "conviction_level": 1,
            "thesis": signal.get("thesis") or signal.get("summary", ""),
            "tags": [],
            "reasoning": str(signal.get("thesis") or ""),
        }

    correlated = correlated_from_signal(signal) if agent_id == "arbitrageAgent" else {
        "polymarket": [],
        "kalshi": [],
        "correlations": [],
    }

    draft = build_cot_decision(
        decision,
        correlated,
        {
            "graphId": output_node_data.get("graphId"),
            "userNodeId": output_node_data.get("userNodeId"),
        },
    )
    return draft


async def maybe_emit_cot_for_subagent(
    signal: dict[str, Any],
    *,
    agent_id: str,
    workflow_context: dict[str, Any],
    ingress: Any,
) -> dict[str, Any] | None:
    """Build and optionally publish CoT when subagent feeds cotBuilder directly."""
    topology = workflow_context.get("topology") or {}
    if not topology.get("auto_emit_cot") and not topology.get("publish_as_mind_agent"):
        return None

    subagent_registry = workflow_context.get("subagent_registry") or {}
    entry = subagent_registry.get(agent_id) or {}
    if not entry.get("feeds_cot_directly"):
        return None

    output_nodes = workflow_context.get("output_nodes") or []
    cot_node = next((o for o in output_nodes if o.get("type") == "cotBuilder"), None)
    cot_data = (cot_node or {}).get("data") or {}
    if not cot_data.get("autoEmit") and not topology.get("publish_as_mind_agent"):
        return None

    draft = build_cot_from_signal(signal, agent_id=agent_id, output_node_data=cot_data)
    if not draft:
        return None

    if ingress is None:
        return draft

    try:
        event = DecisionEvent.model_validate(draft)
        normalized = normalize_decision(event).model_dump()
        await ingress.publish_publisher_cot_delta(normalized)
        logger.info("Subagent %s emitted CoT %s", agent_id, normalized.get("decision_id"))
        return normalized
    except Exception as exc:
        logger.warning("Subagent CoT emit failed agent=%s: %s", agent_id, exc)
        return None
