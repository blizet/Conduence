from typing import Any

import httpx

from app.config import TOOL_FETCH_TIMEOUT_MS
from app.tools.access import resolve_access, resolve_api_key

CMC_BASE_URL = "https://pro-api.coinmarketcap.com"


def _normalized(
    *,
    request: dict[str, Any],
    data: Any = None,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "ok": error is None,
        "source": "coinmarketcap",
        "request": request,
        "data": data if error is None else None,
        "error": error,
    }


async def fetch_coinmarketcap(body: dict[str, Any]) -> dict[str, Any]:
    access_mode, endpoint, access_error = resolve_access(
        "coinmarketcap", body, default_endpoint="quotes_latest"
    )
    api_key = resolve_api_key("coinmarketcap", body)
    symbols = body.get("symbols") or body.get("symbol") or "BTC"
    convert = (body.get("convert") or "USD").strip() or "USD"

    request: dict[str, Any] = {
        "accessMode": access_mode,
        "endpoint": endpoint,
        "symbols": symbols,
        "convert": convert,
    }

    if access_error:
        return _normalized(request=request, error=access_error)

    headers = {"X-CMC_PRO_API_KEY": api_key, "Accept": "application/json"}
    timeout = TOOL_FETCH_TIMEOUT_MS / 1000

    if endpoint == "quotes_latest":
        url = f"{CMC_BASE_URL}/v1/cryptocurrency/quotes/latest"
        params: dict[str, Any] = {"symbol": symbols, "convert": convert}
    elif endpoint == "listings_latest":
        url = f"{CMC_BASE_URL}/v1/cryptocurrency/listings/latest"
        params = {"convert": convert, "limit": int(body.get("limit") or 100)}
    elif endpoint == "quotes_historical":
        url = f"{CMC_BASE_URL}/v2/cryptocurrency/quotes/historical"
        params = {"symbol": symbols, "convert": convert, "count": int(body.get("count") or 10)}
    elif endpoint == "info":
        url = f"{CMC_BASE_URL}/v2/cryptocurrency/info"
        params = {"symbol": symbols}
    elif endpoint == "global_metrics":
        url = f"{CMC_BASE_URL}/v1/global-metrics/quotes/latest"
        params = {"convert": convert}
    elif endpoint == "trending":
        url = f"{CMC_BASE_URL}/v1/cryptocurrency/trending/most-visited"
        params = {"limit": int(body.get("limit") or 10)}
    else:
        return _normalized(request=request, error=f"Unknown CoinMarketCap endpoint: {endpoint}")

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url, params=params, headers=headers)
            payload = response.json()
            if response.status_code >= 400:
                message = payload.get("status", {}).get("error_message") if isinstance(payload, dict) else None
                return _normalized(
                    request=request,
                    error=message or f"CoinMarketCap request failed ({response.status_code})",
                )
            return _normalized(request=request, data=payload)
    except Exception as exc:
        return _normalized(request=request, error=str(exc))
