"""LLM-facing tool registry — describes how, when, and what to call each tool for.

Companion to tools_registry.py (which holds the *handlers*). This module holds the
*specs* an LLM needs to select tools and fill their parameters:

- `parameters` is a JSON Schema the model fills. Credentials (apiKey etc.) are
  deliberately ABSENT — the server injects them from tool_configs / env after the
  model has chosen the call. Never expose keys to the model.
- `when_to_use` / `when_not_to_use` are routing guidance, rendered into the
  system prompt by `render_tool_guide()`.
- `to_openai_tools()` emits OpenAI/Anthropic-style function-calling schemas.

Every tool returns the same envelope:
  { "ok": bool, "source": str, "request": {...}, "data": {...} | null, "error": str | null }
"""

from __future__ import annotations

from typing import Any

TOOL_SPECS: dict[str, dict[str, Any]] = {
    # ------------------------------------------------------------------ price
    "coingecko": {
        "name": "coingecko",
        "category": "price",
        "cost": "free, no API key, rate-limited (~30 req/min)",
        "description": (
            "Spot USD price and 24h percent change for one or more coins, keyed by "
            "CoinGecko id (lowercase slug like 'bitcoin', 'ethereum', 'solana' — NOT "
            "ticker symbols). Cheapest and fastest price check in the system."
        ),
        "when_to_use": [
            "A signal mentions specific coins and you need current price / 24h momentum.",
            "You need baseChange/otherChange inputs for the divergence tool.",
            "Default first choice for any price question.",
        ],
        "when_not_to_use": [
            "You only have ticker symbols (BTC, ETH) and can't map them to slugs — use coinmarketcap.",
            "You need market cap, volume, 1h/7d change, or non-USD quotes — use coinmarketcap.",
        ],
        "parameters": {
            "type": "object",
            "properties": {
                "ids": {
                    "type": "string",
                    "description": (
                        "Comma-separated CoinGecko ids (lowercase slugs), e.g. "
                        "'bitcoin,ethereum,solana'. Max ~8 ids per call."
                    ),
                },
            },
            "required": ["ids"],
        },
        "returns": (
            "data.prices = {id: {usd: float, usd_24h_change: float}}; "
            "data.missing = ids the API did not recognize (treat as a typo — fix the "
            "slug and retry rather than concluding the coin has no price)."
        ),
        "example_call": {"ids": "bitcoin,ethereum"},
    },
    "coinmarketcap": {
        "name": "coinmarketcap",
        "category": "price",
        "cost": "metered (CMC API credits per call)",
        "description": (
            "Latest quotes by TICKER SYMBOL from CoinMarketCap: price, volume_24h, "
            "percent_change_1h/24h/7d, market_cap, circulating supply, rank. Richer "
            "than coingecko but costs credits."
        ),
        "when_to_use": [
            "You only have ticker symbols (BTC, SOL) rather than CoinGecko slugs.",
            "You need 1h or 7d momentum, market cap, or volume context.",
            "You need quotes in a non-USD currency (convert=EUR, INR, BTC, ...).",
        ],
        "when_not_to_use": [
            "A plain USD spot price would do — prefer the free coingecko tool.",
        ],
        "parameters": {
            "type": "object",
            "properties": {
                "symbols": {
                    "type": "string",
                    "description": "Comma-separated ticker symbols, e.g. 'BTC,ETH,SOL'.",
                },
                "convert": {
                    "type": "string",
                    "description": "Quote currency. Default 'USD'.",
                    "default": "USD",
                },
            },
            "required": ["symbols"],
        },
        "returns": (
            "Raw CMC quotes/latest payload: data.<SYMBOL>.quote.<CONVERT> has price, "
            "volume_24h, percent_change_1h/24h/7d, market_cap."
        ),
        "example_call": {"symbols": "BTC,ETH", "convert": "USD"},
    },
    # ------------------------------------------------------------------ macro
    "defillama": {
        "name": "defillama",
        "category": "macro",
        "cost": "free for all modes except tokenProtocols (Pro key, server-injected)",
        "description": (
            "DeFi TVL data from DeFiLlama. 'mode' selects the endpoint; some modes "
            "need an extra field (see parameter descriptions). Use the narrowest mode "
            "that answers the question — 'protocols' returns thousands of entries."
        ),
        "when_to_use": [
            "Signal touches DeFi: protocol exploit, TVL flight, chain rotation, stablecoin stress.",
            "mode=tvl or mode=protocol when the signal names a protocol (e.g. 'Aave exploit' -> protocol='aave').",
            "mode=chain when the question is about liquidity moving to/from one chain.",
            "mode=chains or historicalChainTvl for sector-wide DeFi health.",
        ],
        "when_not_to_use": [
            "Pure price questions (use coingecko/coinmarketcap).",
            "mode=protocols as a default — only when you genuinely need the full ranked list.",
        ],
        "parameters": {
            "type": "object",
            "properties": {
                "mode": {
                    "type": "string",
                    "enum": [
                        "protocols",
                        "protocol",
                        "tvl",
                        "chains",
                        "historicalChainTvl",
                        "chain",
                        "tokenProtocols",
                    ],
                    "description": (
                        "protocols: all protocols ranked by TVL (large response). "
                        "protocol: one protocol's history + per-chain TVL (requires "
                        "'protocol'). tvl: single current-TVL number (requires "
                        "'protocol'). chains: all chains with current TVL. "
                        "historicalChainTvl: total DeFi TVL time series. chain: TVL "
                        "series for one chain (requires 'chain'). tokenProtocols: "
                        "protocols holding a token (requires 'symbol'; Pro key)."
                    ),
                },
                "protocol": {
                    "type": "string",
                    "description": "DeFiLlama protocol slug, e.g. 'aave', 'lido', 'uniswap'. Required for mode=protocol|tvl.",
                },
                "chain": {
                    "type": "string",
                    "description": "Chain name, e.g. 'Ethereum', 'Arbitrum', 'Base'. Required for mode=chain.",
                },
                "symbol": {
                    "type": "string",
                    "description": "Token symbol, e.g. 'usdt'. Required for mode=tokenProtocols.",
                },
            },
            "required": ["mode"],
        },
        "returns": (
            "mode=tvl: a single number (USD TVL). mode=protocol: {tvl: [...series], "
            "chainTvls: {...}}. mode=chain|historicalChainTvl: [{date, tvl}]. "
            "mode=protocols|chains: list of objects with name/tvl/change_1d/change_7d."
        ),
        "example_call": {"mode": "tvl", "protocol": "aave"},
    },
    # ---------------------------------------------------------------- onchain
    "cryptoquant": {
        "name": "cryptoquant",
        "category": "onchain",
        "cost": "metered (plan-gated; invalid metrics still consume calls)",
        "description": (
            "On-chain / exchange-flow metrics from CryptoQuant. 'metric' is an API "
            "path under api.cryptoquant.com/v1/. ONLY use metric paths listed in the "
            "enum below — do not invent paths; unknown paths fail and waste credits."
        ),
        "when_to_use": [
            "Exchange inflow/outflow or netflow spikes (coins moving to exchanges = sell pressure).",
            "Whale activity ratios, miner flows, funding rates, open interest context.",
            "Verifying whether a news narrative ('whales dumping') shows up on-chain.",
        ],
        "when_not_to_use": [
            "Price or TVL questions — wrong data source.",
            "Any metric path not in the verified list.",
        ],
        "parameters": {
            "type": "object",
            "properties": {
                "metric": {
                    "type": "string",
                    "enum": [
                        "btc/exchange-flows/netflow",
                        "btc/exchange-flows/inflow",
                        "btc/exchange-flows/outflow",
                        "btc/exchange-flows/reserve",
                        "btc/flow-indicator/exchange-whale-ratio",
                        "btc/flow-indicator/mpi",
                        "btc/miner-flows/netflow",
                        "btc/market-data/funding-rates",
                        "btc/market-data/open-interest",
                        "eth/exchange-flows/netflow",
                        "eth/exchange-flows/reserve",
                        "eth/market-data/funding-rates",
                    ],
                    "description": (
                        "Verified CryptoQuant metric path. Pick the one matching the "
                        "question; netflow/reserve for sell-pressure, whale-ratio for "
                        "whale activity, funding-rates/open-interest for derivatives."
                    ),
                },
                "window": {
                    "type": "string",
                    "enum": ["hour", "day"],
                    "default": "day",
                    "description": "Aggregation window. Use 'hour' only for intraday spike confirmation.",
                },
                "exchange": {
                    "type": "string",
                    "description": (
                        "Optional exchange filter, e.g. 'binance', 'coinbase_advanced', "
                        "'okx'. Omit for all-exchange aggregate."
                    ),
                },
            },
            "required": ["metric"],
        },
        "returns": "Raw payload; result.data is a timestamped series of {date/value} points for the metric.",
        "example_call": {"metric": "btc/exchange-flows/netflow", "window": "day", "exchange": "binance"},
    },
    # --------------------------------------------------------------- research
    "tavily": {
        "name": "tavily",
        "category": "research",
        "cost": "metered (per search; 'advanced' depth costs ~2x 'basic')",
        "description": (
            "General web search with LLM-ready extracted content. The escalation / "
            "catch-all tool when structured sources (price, TVL, on-chain) cannot "
            "answer the question."
        ),
        "when_to_use": [
            "Signal references an event no structured tool covers (regulation, hacks, ETF rulings, macro).",
            "You need to verify or expand a headline before acting on it.",
            "Background/context gathering on an unfamiliar entity in a signal.",
        ],
        "when_not_to_use": [
            "Data already available from a structured tool (price, TVL, flows) — those are cheaper and cleaner.",
            "As a default on every signal — this is the escalation path, not the fast path.",
        ],
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural-language search query. Be specific: include entity names, event, timeframe.",
                },
                "searchDepth": {
                    "type": "string",
                    "enum": ["basic", "advanced"],
                    "default": "basic",
                    "description": "'basic' for quick lookups; 'advanced' only when basic results were insufficient.",
                },
                "maxResults": {
                    "type": "integer",
                    "default": 5,
                    "minimum": 1,
                    "maximum": 10,
                    "description": "Number of results. Keep <=5 unless doing broad research.",
                },
            },
            "required": ["query"],
        },
        "returns": (
            "data.results = [{title, url, content, score}] sorted by relevance; "
            "data.answer may contain a synthesized summary."
        ),
        "example_call": {"query": "SEC ruling spot ethereum ETF June 2026", "searchDepth": "basic", "maxResults": 5},
    },
    # ------------------------------------------------------------------- news
    "coindesk": {
        "name": "coindesk",
        "category": "news",
        "cost": "metered (CoinDesk Data API key, server-injected)",
        "description": (
            "CoinDesk news API. 'operation' selects what to fetch. This is normally "
            "the autonomous News agent's signal source; call it directly only for "
            "on-demand news lookups (e.g. researching a past event or pulling the "
            "full body of an article a signal referenced)."
        ),
        "when_to_use": [
            "operation=search to research past coverage of an entity or event.",
            "operation=getArticle to read the full article behind a truncated signal summary.",
            "operation=latestArticles for an on-demand pull of recent headlines, optionally filtered by category.",
            "operation=listCategories / listSources first, to discover valid filter values.",
        ],
        "when_not_to_use": [
            "Continuous monitoring — the News mind agent already streams latestArticles; don't poll it yourself.",
            "General web questions — use tavily.",
        ],
        "parameters": {
            "type": "object",
            "properties": {
                "operation": {
                    "type": "string",
                    "enum": ["latestArticles", "search", "getArticle", "listSources", "listCategories"],
                    "description": "Which CoinDesk endpoint to call.",
                },
                "query": {
                    "type": "string",
                    "description": "Search terms. Required for operation=search.",
                },
                "limit": {
                    "type": "integer",
                    "default": 20,
                    "minimum": 1,
                    "maximum": 100,
                    "description": "Max articles for latestArticles/search.",
                },
                "categories": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": (
                        "Category slugs to include for latestArticles, e.g. ['BTC', "
                        "'REGULATION']. Use listCategories to discover valid values."
                    ),
                },
                "excludeCategories": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Category slugs to exclude for latestArticles.",
                },
                "sourceId": {
                    "type": "string",
                    "description": "Source id filter (latestArticles) or the article's source (getArticle, required).",
                },
                "guid": {
                    "type": "string",
                    "description": "Article GUID. Required for operation=getArticle.",
                },
                "language": {
                    "type": "string",
                    "description": "Language filter, e.g. 'EN'.",
                },
                "toTimestamp": {
                    "type": "integer",
                    "description": "Unix timestamp upper bound for latestArticles — use to paginate backwards in time.",
                },
            },
            "required": ["operation"],
        },
        "returns": (
            "latestArticles/search: data.articles = [{id, guid, sourceId, title, url, "
            "publishedAt, source, summary(<=280 chars)}]. getArticle: data.article "
            "(same shape, full body in raw). listSources/listCategories: raw lists "
            "of valid filter values."
        ),
        "example_call": {"operation": "search", "query": "bitcoin ETF outflows", "limit": 10},
    },
}


def to_openai_tools(connected: list[str] | None = None) -> list[dict[str, Any]]:
    """Emit OpenAI function-calling schemas for the connected tools."""
    ids = connected if connected is not None else list(TOOL_SPECS.keys())
    tools: list[dict[str, Any]] = []
    for tool_id in ids:
        spec = TOOL_SPECS.get(tool_id)
        if not spec:
            continue
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": spec["name"],
                    "description": f"[{spec['category']}] {spec['description']} Returns: {spec['returns']}",
                    "parameters": spec["parameters"],
                },
            }
        )
    return tools


def render_tool_guide(connected: list[str] | None = None) -> str:
    """Render when/when-not guidance for the system prompt."""
    ids = connected if connected is not None else list(TOOL_SPECS.keys())
    sections: list[str] = [
        "You have access to the following data tools. Every tool returns "
        '{ok, source, request, data, error}; on ok=false read "error" and either '
        "fix the parameters and retry once, or move on — never fabricate data.",
    ]
    for tool_id in ids:
        spec = TOOL_SPECS.get(tool_id)
        if not spec:
            continue
        use = "\n".join(f"  - {line}" for line in spec["when_to_use"])
        avoid = "\n".join(f"  - {line}" for line in spec["when_not_to_use"])
        sections.append(
            f"## {spec['name']} ({spec['category']}; cost: {spec['cost']})\n"
            f"{spec['description']}\n"
            f"Use when:\n{use}\n"
            f"Avoid when:\n{avoid}\n"
            f"Example call: {spec['example_call']}"
        )
    sections.append(
        "Routing order: prefer free/structured tools (coingecko, defillama) before "
        "metered ones (coinmarketcap, cryptoquant, coindesk), and use tavily only "
        "when structured sources cannot answer. Batch independent lookups instead "
        "of calling tools one at a time."
    )
    return "\n\n".join(sections)
