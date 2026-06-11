"""Compile React Flow canvas topology into orchestrator config."""

from __future__ import annotations

from typing import Any

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
MIND_AGENT_NODE_TYPES = frozenset({"newsAgent", "arbitrageAgent"})
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
            tool_configs[node_type] = data

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
