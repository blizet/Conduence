from typing import Any

import httpx

from app.config import TOOL_FETCH_TIMEOUT_MS
from app.tools.access import resolve_access, resolve_api_key

CRYPTO_NEWS_BASE_URL = "https://cryptonews-api.com/api/v1"


def _normalized(
    *,
    request: dict[str, Any],
    data: Any = None,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "ok": error is None,
        "source": "cryptonews",
        "request": request,
        "data": data if error is None else None,
        "error": error,
    }


def _path_for_endpoint(endpoint: str) -> str:
    paths = {
        "ticker_news": "",
        "general_news": "/category",
        "all_ticker_news": "/category",
        "sentiment": "/stat",
        "trending_headlines": "/trending-headlines",
        "events": "/events",
    }
    return paths.get(endpoint, "")


async def fetch_cryptonews(body: dict[str, Any]) -> dict[str, Any]:
    access_mode, endpoint, access_error = resolve_access(
        "cryptonews", body, default_endpoint="ticker_news"
    )
    api_key = resolve_api_key("cryptonews", body)
    tickers = (body.get("tickers") or "BTC").strip() or "BTC"
    items = int(body.get("items") or 10)
    sentiment = (body.get("sentiment") or "").strip()
    keywords = (body.get("keywords") or "").strip()

    request: dict[str, Any] = {
        "accessMode": access_mode,
        "endpoint": endpoint,
        "tickers": tickers,
        "items": items,
        "sentiment": sentiment or None,
        "keywords": keywords or None,
    }

    if access_error:
        return _normalized(request=request, error=access_error)

    params: dict[str, Any] = {"token": api_key, "items": items}
    if endpoint == "ticker_news":
        params["tickers"] = tickers
    elif endpoint == "general_news":
        params["section"] = "general"
    elif endpoint == "all_ticker_news":
        params["section"] = "alltickers"
    elif endpoint == "sentiment":
        params["tickers"] = tickers
    elif endpoint == "trending_headlines":
        pass
    elif endpoint == "events":
        pass
    else:
        return _normalized(request=request, error=f"Unknown CryptoNews endpoint: {endpoint}")

    if sentiment:
        params["sentiment"] = sentiment
    if keywords:
        params["search"] = keywords

    path = _path_for_endpoint(endpoint)
    timeout = TOOL_FETCH_TIMEOUT_MS / 1000
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(f"{CRYPTO_NEWS_BASE_URL}{path}", params=params)
            payload = response.json()
            if response.status_code >= 400:
                return _normalized(
                    request=request,
                    error=f"CryptoNews API request failed ({response.status_code})",
                )
            return _normalized(request=request, data=payload)
    except Exception as exc:
        return _normalized(request=request, error=str(exc))
