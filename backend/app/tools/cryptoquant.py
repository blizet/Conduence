from typing import Any

import httpx

from app.config import TOOL_FETCH_TIMEOUT_MS
from app.tools.access import resolve_access, resolve_api_key

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
    access_mode, endpoint, access_error = resolve_access(
        "cryptoquant", body, default_endpoint="metric"
    )
    api_key = resolve_api_key("cryptoquant", body)
    metric = (body.get("metric") or "").strip()
    exchange = (body.get("exchange") or "").strip()
    symbol = (body.get("symbol") or "btc").strip().lower()
    window = (body.get("window") or "day").strip().lower()

    request: dict[str, Any] = {
        "accessMode": access_mode,
        "endpoint": endpoint,
        "metric": metric,
        "exchange": exchange,
        "symbol": symbol,
        "window": window,
    }

    if access_error:
        return _normalized(request=request, error=access_error)

    if endpoint == "entity_list":
        url = f"{CRYPTOQUANT_BASE_URL}/btc/status/entity-list"
        params: dict[str, Any] = {}
    elif endpoint == "metric":
        if not metric:
            return _normalized(request=request, error="metric is required")
        url = f"{CRYPTOQUANT_BASE_URL}/{metric.lstrip('/')}"
        params = {"symbol": symbol, "window": window}
        if exchange:
            params["exchange"] = exchange
    else:
        return _normalized(request=request, error=f"Unknown CryptoQuant endpoint: {endpoint}")

    timeout = TOOL_FETCH_TIMEOUT_MS / 1000
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                url,
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
