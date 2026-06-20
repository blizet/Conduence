from datetime import datetime, timezone
from typing import Any

from app.decisions.experience_chain import build_experience_decision, infer_agentic_anchors

DEFAULT_GRAPH_ID = "user_771.main.v1"
DEFAULT_USER_NODE_ID = "user_771"
_trade_counter = 0


def _next_trade_id() -> str:
    global _trade_counter
    _trade_counter += 1
    return f"TRD_M{_trade_counter:03d}"


def _action_label(action: str) -> str:
    if action == "BUY_YES":
        return "Buy YES"
    if action == "BUY_NO":
        return "Buy NO"
    if action == "SELL_YES":
        return "Sell YES"
    if action == "SELL_NO":
        return "Sell NO"
    return "Hold"


def build_cot_decision(
    decision: dict[str, Any],
    correlated: dict[str, Any],
    options: dict[str, Any] | None = None,
    *,
    provenance: dict[str, Any] | None = None,
    signal: dict[str, Any] | None = None,
    graph_impacts: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    options = options or {}
    if decision.get("action") == "HOLD" or decision.get("market_id") == "NONE":
        return None

    graph_id = options.get("graphId", DEFAULT_GRAPH_ID)
    user_node_id = options.get("userNodeId", DEFAULT_USER_NODE_ID)
    trade_id = options.get("tradeId", _next_trade_id())
    decision_id = options.get("decisionId") or f"dec-{trade_id.lower()}-open"
    market_id = decision["market_id"]
    now = datetime.now(timezone.utc).isoformat()
    action = str(decision["action"])
    action_label = _action_label(action)
    tags = decision.get("tags") or []

    pm_markets = correlated.get("polymarket", [])
    pm_market = next((m for m in pm_markets if m.get("id") == market_id), None)
    correlated_targets = [
        c["kalId"]
        for c in correlated.get("correlations", [])
        if c.get("pmId") == market_id
    ]
    other_pm_peers = [m["id"] for m in pm_markets if m.get("id") != market_id][:2]
    targets = list(dict.fromkeys([*correlated_targets, *other_pm_peers]))

    pm_url = (pm_market or {}).get("url", "https://polymarket.com")
    base_provenance = dict(provenance or {"raw_sources": [pm_url]})
    if "raw_sources" not in base_provenance:
        base_provenance = {**base_provenance, "raw_sources": [pm_url]}

    synth_signal = signal or {
        "type": "orchestrator",
        "agent": "orchestrator",
        "summary": decision.get("thesis") or decision.get("reasoning"),
        "thesis": decision.get("thesis"),
        "keywords": [str(t).lstrip("#") for t in tags[:6]],
    }

    anchors = infer_agentic_anchors(synth_signal, graph_impacts=graph_impacts, tags=tags)

    return build_experience_decision(
        graph_id=graph_id,
        user_node_id=user_node_id,
        trade_id=trade_id,
        decision_id=decision_id,
        market_id=market_id,
        protocol_id="Polymarket",
        action=action,
        action_label=action_label,
        thesis=str(decision.get("thesis") or ""),
        reasoning=str(decision.get("reasoning") or ""),
        conviction_level=int(decision.get("conviction_level") or 5),
        tags=tags,
        signal=synth_signal,
        market_properties={"slug": decision.get("market_slug") or (pm_market or {}).get("slug")},
        market_edge_metadata={
            "source_url": pm_url,
            "confidence_score": float(decision.get("conviction_level", 5)) / 10,
            "slug": decision.get("market_slug") or (pm_market or {}).get("slug"),
            "condition_id": decision.get("condition_id") or (pm_market or {}).get("conditionId"),
        },
        agentic_anchors=anchors,
        correlated_targets=targets or None,
        provenance=base_provenance,
        updated_at=now,
        origin="live",
    )
