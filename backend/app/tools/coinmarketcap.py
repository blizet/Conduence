from typing import Any

import httpx

from app.config import TOOL_FETCH_TIMEOUT_MS

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
    api_key = (body.get("apiKey") or "").strip()
    symbols = body.get("symbols") or body.get("symbol") or "BTC"
    convert = (body.get("convert") or "USD").strip() or "USD"

    request = {"symbols": symbols, "convert": convert}

    if not api_key:
        return _normalized(request=request, error="apiKey is required")

    params = {"symbol": symbols, "convert": convert}
    headers = {"X-CMC_PRO_API_KEY": api_key, "Accept": "application/json"}
    timeout = TOOL_FETCH_TIMEOUT_MS / 1000

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                f"{CMC_BASE_URL}/v1/cryptocurrency/quotes/latest",
                params=params,
                headers=headers,
            )
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
