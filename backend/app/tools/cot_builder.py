from datetime import datetime, timezone
from typing import Any

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
    return "Hold"


def _outcome_node_id(action: str) -> str:
    return "OUT_NO_CONTRACTS" if action == "BUY_NO" else "OUT_YES_SHARES"


def build_cot_decision(
    decision: dict[str, Any],
    correlated: dict[str, Any],
    options: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    options = options or {}
    if decision.get("action") == "HOLD" or decision.get("market_id") == "NONE":
        return None

    graph_id = options.get("graphId", DEFAULT_GRAPH_ID)
    user_node_id = options.get("userNodeId", DEFAULT_USER_NODE_ID)
    trade_id = options.get("tradeId", _next_trade_id())
    market_id = decision["market_id"]
    now = datetime.now(timezone.utc).isoformat()
    action = _action_label(decision["action"])

    pm_markets = correlated.get("polymarket", [])
    pm_market = next((m for m in pm_markets if m.get("id") == market_id), None)
    correlated_targets = [
        c["kalId"]
        for c in correlated.get("correlations", [])
        if c.get("pmId") == market_id
    ]
    other_pm_peers = [m["id"] for m in pm_markets if m.get("id") != market_id][:2]
    targets = list(dict.fromkeys([*correlated_targets, *other_pm_peers]))

    nodes = [
        {"node_id": user_node_id, "node_type": "user"},
        {"node_id": "Polymarket", "node_type": "protocol"},
        {"node_id": market_id, "node_type": "market"},
        {"node_id": trade_id, "node_type": "trade"},
        {"node_id": _outcome_node_id(decision["action"]), "node_type": "outcome"},
        {"node_id": "FB_OPEN", "node_type": "feedback"},
    ]
    for kal_id in correlated_targets:
        if not any(n["node_id"] == kal_id for n in nodes):
            nodes.append({"node_id": kal_id, "node_type": "market"})

    pm_url = (pm_market or {}).get("url", "https://polymarket.com")
    edges = [
        {"source": user_node_id, "target": "Polymarket"},
        {
            "source": "Polymarket",
            "target": market_id,
            "metadata": {
                "source_url": pm_url,
                "confidence_score": 1.0,
                "slug": decision.get("market_slug") or (pm_market or {}).get("slug"),
                "condition_id": decision.get("condition_id") or (pm_market or {}).get("conditionId"),
            },
        },
        {
            "source": market_id,
            "target": trade_id,
            "Action": action,
            "metadata": {
                "thesis": decision["thesis"],
                "conviction_level": decision["conviction_level"],
                "tags": decision["tags"],
                "reasoning": decision["reasoning"],
                "source_url": pm_url,
                "confidence_score": decision["conviction_level"] / 10,
                "timestamp": now,
            },
        },
        {
            "source": trade_id,
            "target": _outcome_node_id(decision["action"]),
            "metadata": {"source_url": pm_url},
        },
        {"source": trade_id, "target": "FB_OPEN", "metadata": {"source_url": pm_url}},
    ]
    if targets:
        edges.append(
            {
                "source": market_id,
                "targets": targets,
                "direction": "bi-directional",
                "metadata": {"relationship_type": "correlated_market"},
            }
        )

    return {
        "schema_version": "1.0",
        "operation": "assert",
        "graph_id": graph_id,
        "decision_id": f"dec-{trade_id.lower()}-open",
        "updated_at": now,
        "nodes": nodes,
        "edges": edges,
        "provenance": {"raw_sources": [pm_url]},
    }
