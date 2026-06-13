"""Compile React Flow canvas topology into orchestrator config."""

from __future__ import annotations

from typing import Any, Literal

from app.orchestrator.graph_registry import ContextGraphId, build_graph_registry
from app.orchestrator.skills_registry import build_skills_registry
from app.orchestrator.tools_registry import build_tool_registry_payload

ContextGraphChoice = Literal["correlation", "decision", "whale_context"]

PURE_TOOL_NODE_TYPES = frozenset(
    {
        "coingecko",
        "coinmarketcap",
        "defillama",
        "cryptonews",
        "cryptoquant",
        "tavily",
        "polymarketGamma",
        "polymarketWallet",
        "divergence",
        "clob",
        "cotBuilder",
    }
)
SUB_AGENT_NODE_TYPES = frozenset({"whaleWallet", "divergenceAgent"})
MIND_AGENT_NODE_TYPES = frozenset({"newsAgent", "arbitrageAgent", "sportsScanner"})
FEED_NODE_TYPES = MIND_AGENT_NODE_TYPES | SUB_AGENT_NODE_TYPES
ORCHESTRATOR_NODE_TYPE = "llm"

SUB_AGENT_REQUIRED_TOOLS: dict[str, list[str]] = {
    "whaleWallet": ["polymarketWallet"],
    "divergenceAgent": ["coingecko", "divergence"],
}


def _index_nodes(nodes: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {n["id"]: n for n in nodes if n.get("id")}


def _incoming_targets(edges: list[dict[str, Any]], target_id: str) -> list[str]:
    return [e["source"] for e in edges if e.get("target") == target_id and e.get("source")]


def _outgoing_targets(edges: list[dict[str, Any]], source_id: str) -> list[str]:
    return [e["target"] for e in edges if e.get("source") == source_id and e.get("target")]


def find_llm_node(nodes: list[dict[str, Any]]) -> dict[str, Any] | None:
    for node in nodes:
        if node.get("type") == ORCHESTRATOR_NODE_TYPE:
            return node
    return None


def _snapped_tools_for_subagent(
    subagent_id: str,
    by_id: dict[str, dict[str, Any]],
    edges: list[dict[str, Any]],
) -> list[str]:
    tools: list[str] = []
    for src_id in _incoming_targets(edges, subagent_id):
        src = by_id.get(src_id)
        if not src:
            continue
        node_type = src.get("type") or ""
        if node_type in PURE_TOOL_NODE_TYPES:
            tools.append(node_type)
    return tools


def compile_canvas(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    llm_node_id: str | None = None,
) -> dict[str, Any]:
    by_id = _index_nodes(nodes)
    llm_node = by_id.get(llm_node_id) if llm_node_id else find_llm_node(nodes)
    if not llm_node:
        llm_node = find_llm_node(nodes)
    if not llm_node:
        return {
            "llm_node_id": None,
            "llm_config": {},
            "connected_tools": ["coingecko", "polymarketGamma"],
            "tool_configs": {},
            "connected_subagents": [],
            "subagent_configs": {},
            "subagent_tools": {},
            "feed_sources": list(MIND_AGENT_NODE_TYPES),
            "output_nodes": [],
        }

    llm_id = llm_node["id"]
    incoming = _incoming_targets(edges, llm_id)
    outgoing = _outgoing_targets(edges, llm_id)

    connected_tools: list[str] = []
    tool_configs: dict[str, dict[str, Any]] = {}
    connected_subagents: list[str] = []
    subagent_configs: dict[str, dict[str, Any]] = {}
    subagent_tools: dict[str, list[str]] = {}
    feed_sources: list[str] = []

    for src_id in incoming:
        src = by_id.get(src_id)
        if not src:
            continue
        node_type = src.get("type") or ""
        data = src.get("data") or {}

        if node_type in SUB_AGENT_NODE_TYPES:
            if node_type not in connected_subagents:
                connected_subagents.append(node_type)
            subagent_configs[node_type] = data
            subagent_tools[node_type] = _snapped_tools_for_subagent(src_id, by_id, edges)
            feed_sources.append(node_type)
        elif node_type in MIND_AGENT_NODE_TYPES:
            feed_sources.append(node_type)
        elif node_type in PURE_TOOL_NODE_TYPES and node_type not in ("cotBuilder", "clob"):
            if node_type not in connected_tools:
                connected_tools.append(node_type)
            key = (data.get("apiKey") or "").strip()
            tool_configs[node_type] = {"apiKey": key} if key else {}

    if not connected_tools:
        connected_tools = ["coingecko", "polymarketGamma"]

    output_nodes: list[dict[str, Any]] = []
    for tgt_id in outgoing:
        tgt = by_id.get(tgt_id)
        if not tgt:
            continue
        output_nodes.append({"id": tgt_id, "type": tgt.get("type"), "data": tgt.get("data") or {}})

    return {
        "llm_node_id": llm_id,
        "llm_config": llm_node.get("data") or {},
        "connected_tools": connected_tools,
        "tool_configs": tool_configs,
        "connected_subagents": connected_subagents,
        "subagent_configs": subagent_configs,
        "subagent_tools": subagent_tools,
        "feed_sources": feed_sources or list(MIND_AGENT_NODE_TYPES),
        "output_nodes": output_nodes,
    }


def _collect_whale_wallets(compiled: dict[str, Any]) -> list[str]:
    wallets: list[str] = []
    whale_cfg = (compiled.get("subagent_configs") or {}).get("whaleWallet") or {}
    for w in whale_cfg.get("walletAddresses") or []:
        w = str(w).strip()
        if w:
            wallets.append(w)
    return wallets


def _parse_context_graph(llm_config: dict[str, Any]) -> ContextGraphId:
    raw = (llm_config.get("contextGraph") or llm_config.get("context_graph") or "correlation").strip()
    if raw in ("correlation", "decision", "whale_context"):
        return raw  # type: ignore[return-value]
    return "correlation"


def compile_orchestrator(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    *,
    config: dict[str, Any] | None = None,
    llm_node_id: str | None = None,
) -> dict[str, Any]:
    """Compile canvas + run config into registries written to OrchestratorState."""
    config = config or {}
    compiled = compile_canvas(nodes, edges, llm_node_id=llm_node_id)
    llm_config = compiled.get("llm_config") or {}

    decision_graph_id = (
        config.get("graphId")
        or llm_config.get("graphId")
        or None
    )
    active_graph = _parse_context_graph(llm_config)
    whale_wallets = _collect_whale_wallets(compiled)
    decision_snapshot = config.get("decision_graph_snapshot") or {}

    if decision_snapshot and decision_graph_id:
        decision_snapshot = {**decision_snapshot, "graph_id": decision_graph_id}

    compiled["client_id"] = config.get("client_id") or llm_config.get("clientId")
    compiled["workflow_id"] = config.get("workflow_id") or llm_config.get("workflowId")

    tool_registry = build_tool_registry_payload(compiled.get("connected_tools"))
    skills_registry = build_skills_registry(compiled)
    graph_registry = build_graph_registry(
        active_id=active_graph,
        decision_graph_id=decision_graph_id,
        decision_snapshot=decision_snapshot if isinstance(decision_snapshot, dict) else {},
        canvas_whale_wallets=whale_wallets,
    )

    return {
        **compiled,
        "context_graph": active_graph,
        "tool_registry": tool_registry,
        "skills_registry": skills_registry,
        "graph_registry": graph_registry,
    }
