import copy
import re
from typing import Set

from app.lib.graph_topology import (
    agent_node_id,
    graph_id_for,
    parse_graph_id,
    primary_user_node_id,
    resolve_agent_context,
    user_slug_from_node_id,
)
from app.schemas.decision import DecisionEvent, GraphEdge, GraphNode

LEGACY_AGENT_ID = "publisher_agent"
AGENT_DISPLAY_ID = "Publisher Agent"

LABEL_MAP = {
    "user": "User",
    "protocol": "Protocol",
    "market": "Market",
    "correlated_market": "CorrelatedMarket",
    "trade": "Trade",
    "outcome": "Outcome",
    "feedback": "Feedback",
    "agent": "Agent",
}

LEGACY_CLOSE_TRADE_OF = {
    "TRD_003": "TRD_001",
    "TRD_005": "TRD_004",
    "TRD_007": "TRD_006",
    "TRD_010": "TRD_008",
    "TRD_012": "TRD_009",
    "TRD_014": "TRD_011",
    "TRD_017": "TRD_013",
}


def graph_name(graph_id: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_]", "_", graph_id)


def escape_cypher(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def scoped_leaf_id(leaf_id: str, trade_id: str) -> str:
    suffix = f"__{trade_id}"
    base = leaf_id
    while base.endswith(suffix):
        base = base[: -len(suffix)]
    return f"{base}{suffix}"


def _slug(value: str) -> str:
    return re.sub(r"^_+|_+$", "", re.sub(r"[^a-zA-Z0-9]+", "_", value)).lower()


def _action_to_rel(action: str) -> str:
    return action.strip().upper().replace(" ", "_")


def _infer_decision_id(edges: list[GraphEdge], updated_at: str) -> str:
    for edge in edges:
        if edge.Action and edge.target:
            return f"dec-{_slug(edge.target)}"
    return f"dec-{updated_at.replace(':', '').replace('.', '').replace('-', '')}"


def _remap_legacy_agent(payload: DecisionEvent, agent_id: str) -> None:
    node_ids = {n.node_id for n in payload.nodes}
    if LEGACY_AGENT_ID not in node_ids and agent_id not in node_ids:
        refs_legacy = any(
            e.source in (LEGACY_AGENT_ID, AGENT_DISPLAY_ID)
            or e.target in (LEGACY_AGENT_ID, AGENT_DISPLAY_ID)
            for e in payload.edges
        )
        if refs_legacy:
            payload.nodes.append(
                GraphNode(
                    node_id=agent_id,
                    node_type="agent",
                    properties={"display_name": "Publisher Agent", "role": "publisher"},
                    label="Agent",
                )
            )

    for node in payload.nodes:
        if node.node_id == LEGACY_AGENT_ID:
            node.node_id = agent_id

    for edge in payload.edges:
        if edge.source in (LEGACY_AGENT_ID, AGENT_DISPLAY_ID):
            edge.source = agent_id
        if edge.target in (LEGACY_AGENT_ID, AGENT_DISPLAY_ID):
            edge.target = agent_id
        if edge.targets:
            edge.targets = [
                agent_id if t in (LEGACY_AGENT_ID, AGENT_DISPLAY_ID) else t
                for t in edge.targets
            ]


def _remap_node_id(payload: DecisionEvent, from_id: str, to_id: str) -> None:
    node = next((n for n in payload.nodes if n.node_id == from_id), None)
    if not node or from_id == to_id:
        return
    node.node_id = to_id
    for edge in payload.edges:
        if edge.source == from_id:
            edge.source = to_id
        if edge.target == from_id:
            edge.target = to_id
        if edge.targets:
            edge.targets = [to_id if t == from_id else t for t in edge.targets]


def _collapse_agent_into_user(payload: DecisionEvent, user_node_id: str, agent_id: str) -> None:
    if user_node_id == agent_id:
        return
    for edge in payload.edges:
        if edge.source == agent_id:
            edge.source = user_node_id
        if edge.target == agent_id:
            edge.target = user_node_id
        if edge.targets:
            edge.targets = [user_node_id if t == agent_id else t for t in edge.targets]
    payload.edges = [e for e in payload.edges if e.relationship_type != "HAS_AGENT"]
    payload.nodes = [n for n in payload.nodes if n.node_id != agent_id and n.node_type != "agent"]


def _normalize_legacy_buy_sell_lifecycle(payload: DecisionEvent) -> None:
    for edge in payload.edges:
        if not edge.Action or not edge.target:
            continue
        match = re.match(r"^(Buy|Sell)\s+(YES|NO)$", edge.Action, re.I)
        if not match:
            continue
        verb = match.group(1).lower()
        side = match.group(2).upper()
        original_trade_id = edge.target
        is_close = verb == "sell"
        trade_id = LEGACY_CLOSE_TRADE_OF.get(original_trade_id, original_trade_id) if is_close else original_trade_id
        if trade_id != original_trade_id:
            _remap_node_id(payload, original_trade_id, trade_id)
        edge.Action = f"{'Close' if is_close else 'Open'} {side}"
        edge.relationship_type = _action_to_rel(edge.Action)
        edge.metadata = {
            **edge.metadata,
            "action": edge.Action,
            "lifecycle": "close" if is_close else "open",
            **({"position_trade_id": trade_id} if is_close else {}),
        }
        payload.operation = "revise" if is_close else "assert"
        payload.decision_id = f"dec-trd_{trade_id.replace('TRD_', '').lower()}-{'close' if is_close else 'open'}"


def _strip_open_lifecycle_orphans(payload: DecisionEvent) -> None:
    is_open = payload.operation == "assert" and any(
        e.metadata.get("lifecycle") == "open"
        or (e.Action and re.match(r"^Open\s", e.Action))
        for e in payload.edges
    )
    if not is_open:
        return
    leaf_ids = {n.node_id for n in payload.nodes if n.node_type == "feedback"}
    payload.edges = [e for e in payload.edges if not e.target or e.target not in leaf_ids]
    payload.nodes = [n for n in payload.nodes if n.node_type != "feedback"]


def _stamp_close_lifecycle(payload: DecisionEvent) -> None:
    is_close = payload.operation == "revise" or any(
        e.metadata.get("lifecycle") == "close"
        or (e.Action and re.match(r"^Close\s", e.Action))
        for e in payload.edges
    )
    if not is_close:
        return
    trade_node = next((n for n in payload.nodes if n.node_type == "trade"), None)
    if not trade_node:
        return
    for e in payload.edges:
        if e.Action and e.target == trade_node.node_id:
            e.metadata = {
                **e.metadata,
                "lifecycle": "close",
                "position_trade_id": trade_node.node_id,
            }


def _scope_trade_leaf_nodes(payload: DecisionEvent) -> None:
    trade_ids: Set[str] = set()
    for edge in payload.edges:
        if edge.Action and edge.target:
            trade_ids.add(edge.target)
    for trade_id in trade_ids:
        for edge in payload.edges:
            if edge.source != trade_id or not edge.target:
                continue
            target_node = next((n for n in payload.nodes if n.node_id == edge.target), None)
            if not target_node or target_node.node_type != "feedback":
                continue
            scoped_id = scoped_leaf_id(edge.target, trade_id)
            if edge.target != scoped_id:
                _remap_node_id(payload, edge.target, scoped_id)


def anchor_market_ids(payload: DecisionEvent) -> Set[str]:
    ids: Set[str] = set()
    for edge in payload.edges:
        if not edge.Action or not edge.target:
            continue
        trade = next(
            (n for n in payload.nodes if n.node_id == edge.target and n.node_type == "trade"),
            None,
        )
        if trade:
            ids.add(edge.source)
    return ids


def _correlated_target_ids(payload: DecisionEvent) -> Set[str]:
    ids: Set[str] = set()
    for edge in payload.edges:
        rel = (edge.relationship_type or str(edge.metadata.get("relationship_type", ""))).upper()
        rel = re.sub(r"[^A-Z0-9_]", "_", rel)
        if rel != "CORRELATED_MARKET":
            continue
        for tid in edge.targets or []:
            ids.add(tid)
    return ids


def _strip_correlated_only_market_nodes(payload: DecisionEvent) -> None:
    anchors = anchor_market_ids(payload)
    payload.nodes = [n for n in payload.nodes if n.node_type != "market" or n.node_id in anchors]


def _stamp_anchor_market_properties(payload: DecisionEvent) -> None:
    anchors = anchor_market_ids(payload)
    for node in payload.nodes:
        if node.node_type == "market" and node.node_id in anchors:
            node.properties = {**node.properties, "anchor": True}


def augment_correlated_peer_nodes(payload: DecisionEvent) -> DecisionEvent:
    existing = {n.node_id for n in payload.nodes}
    peers = _correlated_target_ids(payload)
    for node_id in peers:
        if node_id in existing:
            continue
        payload.nodes.append(
            GraphNode(
                node_id=node_id,
                node_type="correlated_market",
                properties={"correlated_peer": True},
                label="CorrelatedMarket",
            )
        )
        existing.add(node_id)
    return payload


def _ensure_has_agent_edge(payload: DecisionEvent, user_node_id: str, agent_id: str, role: str) -> None:
    node_ids = {n.node_id for n in payload.nodes}
    if user_node_id not in node_ids or agent_id not in node_ids:
        return
    has = any(
        e.source == user_node_id and e.target == agent_id and e.relationship_type == "HAS_AGENT"
        for e in payload.edges
    )
    if not has:
        payload.edges.insert(
            0,
            GraphEdge(
                source=user_node_id,
                target=agent_id,
                relationship_type="HAS_AGENT",
                metadata={"role": role},
            ),
        )


def normalize_decision(raw: DecisionEvent) -> DecisionEvent:
    payload = copy.deepcopy(raw)
    payload.schema_version = payload.schema_version or "1.0"
    payload.operation = payload.operation or "assert"
    _normalize_legacy_buy_sell_lifecycle(payload)

    ctx = resolve_agent_context(payload)
    if ctx:
        if not parse_graph_id(payload.graph_id):
            payload.graph_id = graph_id_for(ctx["userSlug"], ctx["role"])
        _remap_legacy_agent(payload, ctx["agentId"])
        if ctx["role"] == "seeker":
            _collapse_agent_into_user(payload, ctx["userNodeId"], ctx["agentId"])
        else:
            _ensure_has_agent_edge(payload, ctx["userNodeId"], ctx["agentId"], ctx["role"])
    else:
        user_node_id = primary_user_node_id(payload.nodes)
        if user_node_id:
            user_slug = user_slug_from_node_id(user_node_id)
            agent_id = agent_node_id(user_slug, "publisher")
            _remap_legacy_agent(payload, agent_id)
            _ensure_has_agent_edge(payload, user_node_id, agent_id, "publisher")

    payload.edges = [e for e in payload.edges if e.metadata.get("direction") != "reverse"]

    normalized_edges: list[GraphEdge] = []
    for edge in payload.edges:
        e = copy.deepcopy(edge)
        rel = e.relationship_type
        if not rel and e.Action:
            rel = _action_to_rel(e.Action)
        if not rel:
            rel = _action_to_rel(str(e.metadata.get("relationship_type", "CONNECTED_TO")))
        e.relationship_type = rel
        e.metadata = {**e.metadata, **({"action": e.Action} if e.Action else {})}
        normalized_edges.append(e)

    payload.edges = normalized_edges
    if not payload.decision_id:
        payload.decision_id = _infer_decision_id(normalized_edges, payload.updated_at)

    _strip_open_lifecycle_orphans(payload)
    _stamp_close_lifecycle(payload)
    _scope_trade_leaf_nodes(payload)
    _strip_correlated_only_market_nodes(payload)
    _stamp_anchor_market_properties(payload)

    payload.nodes = [
        GraphNode(
            node_id=n.node_id,
            node_type=n.node_type,
            properties=n.properties or {},
            label=n.label or LABEL_MAP.get(n.node_type, "Entity"),
        )
        for n in payload.nodes
    ]
    return payload
