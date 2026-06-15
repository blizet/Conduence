"""Compile React Flow canvas into workflow registries (tools, subagents, mind agents, orchestrator)."""

from __future__ import annotations

from typing import Any, Literal

from app.orchestrator.graph_registry import ContextGraphId, build_graph_registry
from app.orchestrator.skills_registry import build_skills_registry
from app.orchestrator.tools_registry import build_tool_registry_payload

ContextGraphChoice = Literal["correlation", "decision"]

EXECUTION_TOOL_NODE_TYPES = frozenset({"clob", "kalshi", "telegram"})

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
        "clob",
        "kalshi",
        "cotBuilder",
    }
)
SUB_AGENT_NODE_TYPES = frozenset({"newsAgent", "arbitrageAgent", "riskAnalyzer"})
MIND_AGENT_NODE_TYPES = frozenset({"sportsScanner"})
ORCHESTRATOR_NODE_TYPE = "llm"

# Default marketplace agent ids for mind-agent node types
MIND_AGENT_DEFAULT_IDS: dict[str, str] = {
    "sportsScanner": "sportsScanner.user_demo",
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


def _node_type(by_id: dict[str, dict[str, Any]], node_id: str) -> str:
    return (by_id.get(node_id) or {}).get("type") or ""


def _snapped_tools_for_node(
    node_id: str,
    by_id: dict[str, dict[str, Any]],
    edges: list[dict[str, Any]],
) -> list[str]:
    tools: list[str] = []
    for src_id in _incoming_targets(edges, node_id):
        src = by_id.get(src_id)
        if not src:
            continue
        node_type = src.get("type") or ""
        if node_type in PURE_TOOL_NODE_TYPES and node_type not in EXECUTION_TOOL_NODE_TYPES and node_type != "cotBuilder":
            if node_type not in tools:
                tools.append(node_type)
    return tools


def _tool_configs_for_tools(
    tool_ids: list[str],
    by_id: dict[str, dict[str, Any]],
    edges: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Collect apiKey configs from tool nodes on canvas matching tool_ids."""
    configs: dict[str, dict[str, Any]] = {}
    wanted = set(tool_ids)
    for node in by_id.values():
        node_type = node.get("type") or ""
        if node_type not in wanted:
            continue
        data = node.get("data") or {}
        key = (data.get("apiKey") or "").strip()
        if key:
            configs[node_type] = {"apiKey": key}
        elif node_type not in configs:
            configs[node_type] = {}
        if node_type == "polymarketWallet":
            wallet = (data.get("pmWallet") or "").strip()
            if wallet:
                configs[node_type]["pmWallet"] = wallet
                configs[node_type]["wallet"] = wallet
            action = data.get("pmWalletAction")
            if action:
                configs[node_type]["pmWalletAction"] = action
            limit = data.get("pmWalletLimit")
            if limit:
                configs[node_type]["pmWalletLimit"] = limit
        elif node_type == "polymarketGamma":
            for field, key_name in (
                ("gammaKeywords", "keywords"),
                ("gammaLimit", "limit"),
                ("gammaMinVolume", "minVolume24h"),
                ("gammaMinLiquidity", "minLiquidity"),
                ("gammaMaxSpread", "maxSpread"),
            ):
                val = data.get(field)
                if val not in (None, ""):
                    configs[node_type][key_name] = val
    return configs


def _parse_context_graph(node_data: dict[str, Any]) -> ContextGraphId:
    raw = (node_data.get("contextGraph") or node_data.get("context_graph") or "correlation").strip()
    if raw in ("correlation", "decision"):
        return raw  # type: ignore[return-value]
    return "correlation"


def _find_subagent_node(nodes: list[dict[str, Any]], subagent_id: str) -> dict[str, Any] | None:
    for node in nodes:
        if node.get("type") == subagent_id:
            return node
    return None


def _subagent_feeds_cot_directly(
    subagent_node_id: str,
    by_id: dict[str, dict[str, Any]],
    edges: list[dict[str, Any]],
    llm_id: str | None,
) -> bool:
    """True when subagent → cotBuilder without passing through llm."""
    for tgt_id in _outgoing_targets(edges, subagent_node_id):
        tgt_type = _node_type(by_id, tgt_id)
        if tgt_type == "cotBuilder":
            return True
        if tgt_type == ORCHESTRATOR_NODE_TYPE:
            return False
        if llm_id and tgt_id == llm_id:
            return False
    return False


def compile_workflow_context(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    *,
    config: dict[str, Any] | None = None,
    llm_node_id: str | None = None,
) -> dict[str, Any]:
    """Build full WorkflowContext from canvas topology."""
    config = config or {}
    by_id = _index_nodes(nodes)
    llm_node = by_id.get(llm_node_id) if llm_node_id else find_llm_node(nodes)
    if not llm_node:
        llm_node = find_llm_node(nodes)

    llm_id = llm_node["id"] if llm_node else None
    llm_config = (llm_node or {}).get("data") or {}
    active_graph = _parse_context_graph(llm_config)

    # --- Subagent registry (all subagent nodes on canvas) ---
    subagent_registry: dict[str, dict[str, Any]] = {}
    for node in nodes:
        node_type = node.get("type") or ""
        if node_type not in SUB_AGENT_NODE_TYPES:
            continue
        node_id = node["id"]
        data = node.get("data") or {}
        execution_tools = _snapped_tools_for_node(node_id, by_id, edges)
        tool_configs = _tool_configs_for_tools(execution_tools, by_id, edges)
        subagent_registry[node_type] = {
            "id": node_type,
            "node_id": node_id,
            "transparent": True,
            "execution_tools": execution_tools,
            "tool_configs": tool_configs,
            "tool_registry": build_tool_registry_payload(execution_tools),
            "llm_config": {
                "llmProvider": data.get("llmProvider"),
                "llmApiKey": data.get("llmApiKey"),
                "model": data.get("model"),
                "temperature": data.get("temperature"),
                "maxTokens": data.get("maxTokens"),
            },
            "userPrompt": (data.get("userPrompt") or "").strip(),
            "simulate": bool(data.get("simulate")),
            "portfolioUsd": data.get("portfolioUsd"),
            "riskPctMin": data.get("riskPctMin"),
            "riskPctMax": data.get("riskPctMax"),
            "maxLiquidityFraction": data.get("maxLiquidityFraction"),
            "minConfidence": data.get("minConfidence"),
            "maxOpenRiskUsd": data.get("maxOpenRiskUsd"),
            "tradeAction": data.get("tradeAction"),
            "tradeMarketId": data.get("tradeMarketId"),
            "tradeTitle": data.get("tradeTitle"),
            "tradeConfidence": data.get("tradeConfidence"),
            "tradePrice": data.get("tradePrice"),
            "tradeVenue": data.get("tradeVenue"),
            "feeds_cot_directly": _subagent_feeds_cot_directly(node_id, by_id, edges, llm_id),
            "wired_to_orchestrator": bool(
                llm_id and llm_id in _outgoing_targets(edges, node_id)
            ),
        }

    # --- Mind agent registry (marketplace feeds on canvas) ---
    mind_agent_registry: dict[str, dict[str, Any]] = {}
    connected_mind_agents: list[str] = []
    for node in nodes:
        node_type = node.get("type") or ""
        if node_type not in MIND_AGENT_NODE_TYPES:
            continue
        data = node.get("data") or {}
        agent_id = (data.get("agentId") or MIND_AGENT_DEFAULT_IDS.get(node_type) or node_type).strip()
        if agent_id not in connected_mind_agents:
            connected_mind_agents.append(agent_id)
        mind_agent_registry[agent_id] = {
            "id": agent_id,
            "node_type": node_type,
            "node_id": node["id"],
            "black_box": True,
            "source": "external",
            "wired_to_orchestrator": bool(
                llm_id and llm_id in _outgoing_targets(edges, node["id"])
            ),
        }

    # --- Orchestrator registry ---
    orchestrator_execution_tools: list[str] = []
    orchestrator_tool_configs: dict[str, dict[str, Any]] = {}
    connected_subagents: list[str] = []
    feed_sources: list[str] = []

    if llm_id:
        for src_id in _incoming_targets(edges, llm_id):
            src = by_id.get(src_id)
            if not src:
                continue
            node_type = src.get("type") or ""

            if node_type in SUB_AGENT_NODE_TYPES:
                if node_type not in connected_subagents:
                    connected_subagents.append(node_type)
                feed_sources.append(node_type)
            elif node_type in MIND_AGENT_NODE_TYPES:
                agent_id = (
                    (src.get("data") or {}).get("agentId")
                    or MIND_AGENT_DEFAULT_IDS.get(node_type)
                    or node_type
                )
                feed_sources.append(agent_id)
            elif node_type in PURE_TOOL_NODE_TYPES and node_type not in EXECUTION_TOOL_NODE_TYPES and node_type not in ("cotBuilder",):
                if node_type not in orchestrator_execution_tools:
                    orchestrator_execution_tools.append(node_type)
                data = src.get("data") or {}
                key = (data.get("apiKey") or "").strip()
                if key:
                    orchestrator_tool_configs[node_type] = {"apiKey": key}
                elif node_type not in orchestrator_tool_configs:
                    orchestrator_tool_configs[node_type] = {}

    visible_tools = list(
        dict.fromkeys(
            orchestrator_execution_tools
            + [
                t
                for sa in connected_subagents
                for t in (subagent_registry.get(sa) or {}).get("execution_tools") or []
            ]
        )
    )

    if not orchestrator_execution_tools and llm_node:
        orchestrator_execution_tools = ["coingecko", "polymarketGamma"]
        visible_tools = list(dict.fromkeys(visible_tools + orchestrator_execution_tools))

    output_nodes: list[dict[str, Any]] = []
    if llm_id:
        for tgt_id in _outgoing_targets(edges, llm_id):
            tgt = by_id.get(tgt_id)
            if tgt:
                output_nodes.append({"id": tgt_id, "type": tgt.get("type"), "data": tgt.get("data") or {}})

    for sa_id, sa_entry in subagent_registry.items():
        if sa_entry.get("feeds_cot_directly"):
            for tgt_id in _outgoing_targets(edges, sa_entry["node_id"]):
                tgt = by_id.get(tgt_id)
                if tgt and tgt.get("type") == "cotBuilder":
                    output_nodes.append({"id": tgt_id, "type": "cotBuilder", "data": tgt.get("data") or {}})

    auto_emit_cot = any((o.get("data") or {}).get("autoEmit") for o in output_nodes if o.get("type") == "cotBuilder")
    publish_as_mind_agent = bool(config.get("publishAsMindAgent") or config.get("mind_agent_live"))

    decision_graph_id = config.get("graphId") or llm_config.get("graphId")
    decision_snapshot = config.get("decision_graph_snapshot") or {}
    if decision_snapshot and decision_graph_id:
        decision_snapshot = {**decision_snapshot, "graph_id": decision_graph_id}

    graph_registry = build_graph_registry(
        active_id=active_graph,
        decision_graph_id=decision_graph_id,
        decision_snapshot=decision_snapshot if isinstance(decision_snapshot, dict) else {},
    )

    # Attach shared graph_registry ref to each subagent entry
    for entry in subagent_registry.values():
        entry["graph_registry"] = graph_registry
        entry["context_graph"] = active_graph

    orchestrator_registry = {
        "has_orchestrator": llm_node is not None,
        "execution_tools": orchestrator_execution_tools,
        "visible_tools": visible_tools,
        "tool_configs": orchestrator_tool_configs,
        "tool_registry": build_tool_registry_payload(orchestrator_execution_tools),
        "connected_subagents": connected_subagents,
        "connected_mind_agents": connected_mind_agents,
        "subagent_registry": {
            k: v for k, v in subagent_registry.items() if k in connected_subagents
        },
        "mind_agent_registry": mind_agent_registry,
        "graph_registry": graph_registry,
        "llm_config": llm_config,
    }

    legacy_compiled = {
        "llm_node_id": llm_id,
        "llm_config": llm_config,
        "connected_tools": orchestrator_execution_tools,
        "tool_configs": orchestrator_tool_configs,
        "connected_subagents": connected_subagents,
        "subagent_configs": {k: (subagent_registry.get(k) or {}).get("llm_config", {}) for k in connected_subagents},
        "subagent_tools": {k: (subagent_registry.get(k) or {}).get("execution_tools", []) for k in subagent_registry},
        "feed_sources": feed_sources,
        "output_nodes": output_nodes,
        "client_id": config.get("client_id") or llm_config.get("clientId"),
        "workflow_id": config.get("workflow_id") or llm_config.get("workflowId"),
    }

    skills_registry = build_skills_registry(legacy_compiled)

    return {
        **legacy_compiled,
        "context_graph": active_graph,
        "tool_registry": orchestrator_registry["tool_registry"],
        "skills_registry": skills_registry,
        "graph_registry": graph_registry,
        "subagent_registry": subagent_registry,
        "mind_agent_registry": mind_agent_registry,
        "orchestrator_registry": orchestrator_registry,
        "topology": {
            "has_orchestrator": llm_node is not None,
            "auto_emit_cot": auto_emit_cot,
            "publish_as_mind_agent": publish_as_mind_agent,
            "standalone_subagents": [
                sa_id
                for sa_id, entry in subagent_registry.items()
                if entry.get("feeds_cot_directly") and not entry.get("wired_to_orchestrator")
            ],
        },
    }


def compile_orchestrator(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    *,
    config: dict[str, Any] | None = None,
    llm_node_id: str | None = None,
) -> dict[str, Any]:
    """Backward-compatible alias used by orchestrator ingest."""
    return compile_workflow_context(nodes, edges, config=config, llm_node_id=llm_node_id)
