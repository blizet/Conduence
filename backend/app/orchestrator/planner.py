"""Plan which connected tools to invoke for a signal."""

from __future__ import annotations

from typing import Any

from app.orchestrator.correlation_graph import CorrelationGraph
from app.orchestrator.tools_registry import ToolRegistry

DEFI_THEMES = frozenset({"defi", "defi_tvl", "layer2", "ethereum"})
ONCHAIN_THEMES = frozenset({"on_chain", "exchange_flows", "mining", "bitcoin"})


def _signal_keywords(signal: dict[str, Any]) -> list[str]:
    kws = [str(k).lower() for k in signal.get("keywords", [])]
    text = signal.get("summary", signal.get("headline", ""))
    if text:
        kws.extend(text.lower().split())
    return kws


def _impacted_coingecko_ids(graph: CorrelationGraph, signal: dict[str, Any]) -> list[str]:
    text = " ".join(_signal_keywords(signal))
    origins = graph.match_keywords(text)
    ids: list[str] = []
    for origin in origins:
        for impact in graph.propagate(origin.id, strength=1.0):
            cg_id = impact.node.coingecko_id
            if cg_id and cg_id not in ids:
                ids.append(cg_id)
    return ids[:8]


def _impacted_search_keywords(graph: CorrelationGraph, signal: dict[str, Any]) -> list[str]:
    text = " ".join(_signal_keywords(signal))
    origins = graph.match_keywords(text)
    keywords: list[str] = []
    for origin in origins:
        keywords.extend(origin.keywords or [origin.id])
        for impact in graph.propagate(origin.id, strength=1.0):
            keywords.extend(impact.node.keywords or [impact.node.id])
    deduped = []
    for kw in keywords:
        if kw not in deduped:
            deduped.append(kw)
    return deduped[:12]


def _has_theme(graph: CorrelationGraph, signal: dict[str, Any], themes: frozenset[str]) -> bool:
    for kw in _impacted_search_keywords(graph, signal):
        if kw in themes:
            return True
    for node in graph.match_keywords(_signal_keywords(signal)):
        if node.id in themes or node.type == "theme":
            return True
    return False


def plan_tool_calls(
    registry: ToolRegistry,
    graph: CorrelationGraph,
    signal: dict[str, Any],
    tool_configs: dict[str, dict[str, Any]],
    *,
    connected_subagents: list[str] | None = None,
    force_enrichment: bool = False,
) -> list[dict[str, Any]]:
    connected_subagents = connected_subagents or []
    calls: list[dict[str, Any]] = []
    keywords = _impacted_search_keywords(graph, signal)
    coingecko_ids = _impacted_coingecko_ids(graph, signal)
    headline = signal.get("headline") or signal.get("summary") or ""

    if registry.is_connected("coingecko") and coingecko_ids:
        cfg = tool_configs.get("coingecko", {})
        params: dict[str, Any] = {"ids": ",".join(coingecko_ids)}
        if cfg.get("apiKey"):
            params["apiKey"] = cfg["apiKey"]
        calls.append({"tool_id": "coingecko", "params": params})
    elif registry.is_connected("coinmarketcap"):
        cfg = tool_configs.get("coinmarketcap", {})
        symbols = cfg.get("cmcSymbols") or ",".join(keywords[:5])
        calls.append(
            {
                "tool_id": "coinmarketcap",
                "params": {
                    "symbols": symbols,
                    "convert": cfg.get("cmcConvert") or "USD",
                    "apiKey": cfg.get("apiKey"),
                },
            }
        )

    if registry.is_connected("polymarketGamma") and keywords:
        cfg = tool_configs.get("polymarketGamma", {})
        calls.append(
            {
                "tool_id": "polymarketGamma",
                "params": {
                    "keywords": cfg.get("gammaKeywords") or keywords[:6],
                    "limit": int(cfg.get("gammaLimit") or 8),
                    "minVolume24h": float(cfg.get("gammaMinVolume") or 10_000),
                    "minLiquidity": float(cfg.get("gammaMinLiquidity") or 10_000),
                    "maxSpread": float(cfg.get("gammaMaxSpread") or 0.05),
                },
            }
        )

    if registry.is_connected("defillama") and _has_theme(graph, signal, DEFI_THEMES):
        cfg = tool_configs.get("defillama", {})
        calls.append(
            {
                "tool_id": "defillama",
                "params": {
                    "mode": cfg.get("defillamaMode") or "protocols",
                    "protocol": cfg.get("defillamaProtocol"),
                    "chain": cfg.get("defillamaChain"),
                    "apiKey": cfg.get("apiKey"),
                },
            }
        )

    if registry.is_connected("cryptoquant") and _has_theme(graph, signal, ONCHAIN_THEMES):
        cfg = tool_configs.get("cryptoquant", {})
        calls.append(
            {
                "tool_id": "cryptoquant",
                "params": {
                    "metric": cfg.get("cryptoquantMetric"),
                    "symbol": cfg.get("cryptoquantSymbol") or "BTC",
                    "window": cfg.get("cryptoquantWindow"),
                    "exchange": cfg.get("cryptoquantExchange"),
                    "apiKey": cfg.get("apiKey"),
                },
            }
        )

    if registry.is_connected("cryptonews") and (force_enrichment or headline):
        cfg = tool_configs.get("cryptonews", {})
        calls.append(
            {
                "tool_id": "cryptonews",
                "params": {
                    "tickers": cfg.get("cryptonewsTickers") or ",".join(keywords[:4]),
                    "items": int(cfg.get("cryptonewsItems") or 10),
                    "apiKey": cfg.get("apiKey"),
                },
            }
        )

    if registry.is_connected("tavily") and force_enrichment:
        cfg = tool_configs.get("tavily", {})
        calls.append(
            {
                "tool_id": "tavily",
                "params": {
                    "query": cfg.get("tavilyQuery") or headline or " ".join(keywords[:6]),
                    "searchDepth": cfg.get("tavilySearchDepth") or "basic",
                    "maxResults": int(cfg.get("tavilyMaxResults") or 5),
                    "apiKey": cfg.get("apiKey"),
                },
            }
        )

    if registry.is_connected("polymarketWallet"):
        cfg = tool_configs.get("polymarketWallet", {})
        wallet = (cfg.get("pmWallet") or "").strip()
        if wallet:
            calls.append(
                {
                    "tool_id": "polymarketWallet",
                    "params": {
                        "wallet": wallet,
                        "action": cfg.get("pmWalletAction") or "trades",
                        "limit": int(cfg.get("pmWalletLimit") or 20),
                    },
                }
            )

    return calls
