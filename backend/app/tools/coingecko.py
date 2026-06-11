"""CoinGecko price-feed tool (free API, no key needed).

Ported from cry/tools/coingecko.py — spot price + 24h change per coingecko id.
"""

from typing import Any

import httpx

from app.config import TOOL_FETCH_TIMEOUT_MS

COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price"


def _normalized(
    *,
    request: dict[str, Any],
    data: Any = None,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "ok": error is None,
        "source": "coingecko",
        "request": request,
        "data": data if error is None else None,
        "error": error,
    }


async def fetch_coingecko(body: dict[str, Any]) -> dict[str, Any]:
    raw_ids = body.get("ids") or ""
    if isinstance(raw_ids, list):
        ids = [str(i).strip().lower() for i in raw_ids if str(i).strip()]
    else:
        ids = [part.strip().lower() for part in str(raw_ids).split(",") if part.strip()]

    request = {"ids": ids}
    if not ids:
        return _normalized(request=request, error="ids is required (comma-separated coingecko ids, e.g. bitcoin,ethereum)")

    params = {
        "ids": ",".join(ids),
        "vs_currencies": "usd",
        "include_24hr_change": "true",
    }
    timeout = TOOL_FETCH_TIMEOUT_MS / 1000

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(COINGECKO_URL, params=params)
            if response.status_code >= 400:
                detail = response.text.strip()[:200] or f"HTTP {response.status_code}"
                return _normalized(
                    request=request,
                    error=f"CoinGecko request failed ({response.status_code}): {detail}",
                )
            payload = response.json()
            if not isinstance(payload, dict):
                return _normalized(request=request, error="Unexpected CoinGecko response shape")
            missing = [cid for cid in ids if cid not in payload]
            data = {"prices": payload, "missing": missing}
            return _normalized(request=request, data=data)
    except Exception as exc:
        return _normalized(request=request, error=str(exc))
