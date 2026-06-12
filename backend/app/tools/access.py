"""Shared public/private access checks for tool handlers."""

from __future__ import annotations

from typing import Any, Literal

from app.config import (
    COINGECKO_API_KEY,
    COINMARKETCAP_API_KEY,
    CRYPTO_NEWS_API_KEY,
    CRYPTOQUANT_API_KEY,
    DEFILLAMA_API_KEY,
    TAVILY_API_KEY,
)

AccessMode = Literal["public", "private"]
EndpointTier = Literal["public", "private"]

_ENV_KEYS: dict[str, str] = {
    "coingecko": COINGECKO_API_KEY,
    "coinmarketcap": COINMARKETCAP_API_KEY,
    "cryptonews": CRYPTO_NEWS_API_KEY,
    "cryptoquant": CRYPTOQUANT_API_KEY,
    "tavily": TAVILY_API_KEY,
    "defillama": DEFILLAMA_API_KEY,
}

_ENDPOINT_TIERS: dict[str, dict[str, EndpointTier]] = {
    "coingecko": {
        "ping": "public",
        "simple_price": "public",
        "coins_list": "public",
        "coins_markets": "public",
        "coin_detail": "public",
        "search": "public",
        "global": "public",
        "exchanges": "public",
        "nfts_list": "public",
        "onchain_networks": "public",
        "coin_market_chart": "private",
        "coin_tickers": "private",
        "onchain_pool_ohlcv": "private",
    },
    "coinmarketcap": {
        "quotes_latest": "private",
        "listings_latest": "private",
        "quotes_historical": "private",
        "info": "private",
        "global_metrics": "private",
        "trending": "private",
    },
    "polymarketGamma": {
        "markets_search": "public",
        "markets_list": "public",
        "events_list": "public",
    },
    "polymarketWallet": {
        "wallet_trades": "public",
        "wallet_positions": "public",
        "wallet_activity": "public",
    },
    "cryptonews": {
        "ticker_news": "private",
        "general_news": "private",
        "all_ticker_news": "private",
        "sentiment": "private",
        "trending_headlines": "private",
        "events": "private",
    },
    "tavily": {
        "search": "private",
        "extract": "private",
    },
    "cryptoquant": {
        "metric": "private",
        "entity_list": "private",
    },
    "defillama": {
        "protocols": "public",
        "protocol": "public",
        "tvl": "public",
        "chains": "public",
        "historicalChainTvl": "public",
        "chain": "public",
        "tokenProtocols": "private",
        "inflows": "private",
        "chainAssets": "private",
    },
}


def endpoint_tier(tool_id: str, endpoint: str) -> EndpointTier:
    return _ENDPOINT_TIERS.get(tool_id, {}).get(endpoint, "private")


def resolve_api_key(tool_id: str, body: dict[str, Any]) -> str:
    return (body.get("apiKey") or _ENV_KEYS.get(tool_id) or "").strip()


def resolve_access(
    tool_id: str,
    body: dict[str, Any],
    *,
    default_endpoint: str,
) -> tuple[AccessMode, str, str | None]:
    """Return (access_mode, endpoint, error_message)."""
    access_mode: AccessMode = body.get("accessMode") or "public"
    if access_mode not in ("public", "private"):
        access_mode = "public"

    endpoint = (body.get("endpoint") or body.get("mode") or default_endpoint).strip() or default_endpoint
    tier = endpoint_tier(tool_id, endpoint)
    api_key = resolve_api_key(tool_id, body)

    if api_key:
        return access_mode, endpoint, None

    if tier == "private" or access_mode == "private":
        return (
            access_mode,
            endpoint,
            f"API key is required for private endpoints — set it on the node or in backend/.env",
        )

    return access_mode, endpoint, None
