from typing import Any

import httpx

from app.config import TOOL_FETCH_TIMEOUT_MS

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


async def fetch_cryptonews(body: dict[str, Any]) -> dict[str, Any]:
    api_key = (body.get("apiKey") or "").strip()
    tickers = (body.get("tickers") or "BTC").strip() or "BTC"
    items = int(body.get("items") or 10)
    sentiment = (body.get("sentiment") or "").strip()
    keywords = (body.get("keywords") or "").strip()

    request = {
        "tickers": tickers,
        "items": items,
        "sentiment": sentiment or None,
        "keywords": keywords or None,
    }

    if not api_key:
        return _normalized(request=request, error="apiKey is required")

    params: dict[str, Any] = {
        "token": api_key,
        "tickers": tickers,
        "items": items,
    }
    if sentiment:
        params["sentiment"] = sentiment
    if keywords:
        params["search"] = keywords

    timeout = TOOL_FETCH_TIMEOUT_MS / 1000
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(CRYPTO_NEWS_BASE_URL, params=params)
            payload = response.json()
            if response.status_code >= 400:
                return _normalized(
                    request=request,
                    error=f"CryptoNews API request failed ({response.status_code})",
                )
            return _normalized(request=request, data=payload)
    except Exception as exc:
        return _normalized(request=request, error=str(exc))
