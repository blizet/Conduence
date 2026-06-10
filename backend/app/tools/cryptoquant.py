from typing import Any

import httpx

from app.config import TOOL_FETCH_TIMEOUT_MS

CRYPTOQUANT_BASE_URL = "https://api.cryptoquant.com/v1"


def _normalized(
    *,
    request: dict[str, Any],
    data: Any = None,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "ok": error is None,
        "source": "cryptoquant",
        "request": request,
        "data": data if error is None else None,
        "error": error,
    }


async def fetch_cryptoquant(body: dict[str, Any]) -> dict[str, Any]:
    api_key = (body.get("apiKey") or "").strip()
    metric = (body.get("metric") or "").strip()
    exchange = (body.get("exchange") or "").strip()
    symbol = (body.get("symbol") or "btc").strip().lower()
    window = (body.get("window") or "day").strip().lower()

    request = {
        "metric": metric,
        "exchange": exchange,
        "symbol": symbol,
        "window": window,
    }

    if not api_key:
        return _normalized(request=request, error="apiKey is required")
    if not metric:
        return _normalized(request=request, error="metric is required")

    # CryptoQuant endpoints vary by plan/metric. This route keeps the metric path configurable.
    endpoint = f"{CRYPTOQUANT_BASE_URL}/{metric.lstrip('/')}"
    params: dict[str, Any] = {"symbol": symbol, "window": window}
    if exchange:
        params["exchange"] = exchange

    timeout = TOOL_FETCH_TIMEOUT_MS / 1000
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                endpoint,
                params=params,
                headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
            )
            payload = response.json()
            if response.status_code >= 400:
                return _normalized(
                    request=request,
                    error=f"CryptoQuant request failed ({response.status_code})",
                )
            return _normalized(request=request, data=payload)
    except Exception as exc:
        return _normalized(request=request, error=str(exc))
