"""CoinGecko tool — public Demo API and private Pro API."""

from typing import Any

import httpx

from app.config import COINGECKO_API_KEY, TOOL_FETCH_TIMEOUT_MS
from app.tools.access import resolve_access, resolve_api_key

COINGECKO_PUBLIC_BASE = "https://api.coingecko.com/api/v3"
COINGECKO_PRO_BASE = "https://pro-api.coingecko.com/api/v3"


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


def _parse_ids(body: dict[str, Any]) -> list[str]:
    raw_ids = body.get("ids") or ""
    if isinstance(raw_ids, list):
        return [str(i).strip().lower() for i in raw_ids if str(i).strip()]
    return [part.strip().lower() for part in str(raw_ids).split(",") if part.strip()]


def _base_and_headers(api_key: str) -> tuple[str, dict[str, str]]:
    if api_key:
        return COINGECKO_PRO_BASE, {"x-cg-pro-api-key": api_key, "Accept": "application/json"}
    return COINGECKO_PUBLIC_BASE, {"Accept": "application/json"}


async def _get_json(
    url: str,
    *,
    params: dict[str, Any] | None = None,
    headers: dict[str, str],
    timeout: float,
) -> tuple[Any, str | None]:
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.get(url, params=params, headers=headers)
        if response.status_code >= 400:
            detail = response.text.strip()[:200] or f"HTTP {response.status_code}"
            return None, f"CoinGecko request failed ({response.status_code}): {detail}"
        return response.json(), None


async def fetch_coingecko(body: dict[str, Any]) -> dict[str, Any]:
    access_mode, endpoint, access_error = resolve_access(
        "coingecko", body, default_endpoint="simple_price"
    )
    api_key = resolve_api_key("coingecko", body)
    ids = _parse_ids(body)
    query = (body.get("query") or "").strip()
    coin_id = (body.get("coinId") or (ids[0] if ids else "")).strip().lower()
    network = (body.get("network") or "").strip()
    pool_address = (body.get("poolAddress") or "").strip()

    request: dict[str, Any] = {
        "accessMode": access_mode,
        "endpoint": endpoint,
        "ids": ids,
        "query": query or None,
        "coinId": coin_id or None,
    }

    if access_error:
        return _normalized(request=request, error=access_error)

    base, headers = _base_and_headers(api_key)
    timeout = TOOL_FETCH_TIMEOUT_MS / 1000

    try:
        if endpoint == "ping":
            data, err = await _get_json(f"{base}/ping", headers=headers, timeout=timeout)
        elif endpoint == "simple_price":
            if not ids:
                return _normalized(
                    request=request,
                    error="ids is required (comma-separated coingecko ids, e.g. bitcoin,ethereum)",
                )
            data, err = await _get_json(
                f"{base}/simple/price",
                params={"ids": ",".join(ids), "vs_currencies": "usd", "include_24hr_change": "true"},
                headers=headers,
                timeout=timeout,
            )
            if not err and isinstance(data, dict):
                missing = [cid for cid in ids if cid not in data]
                data = {"prices": data, "missing": missing}
        elif endpoint == "coins_list":
            data, err = await _get_json(
                f"{base}/coins/list", params={"include_platform": "false"}, headers=headers, timeout=timeout
            )
        elif endpoint == "coins_markets":
            data, err = await _get_json(
                f"{base}/coins/markets",
                params={
                    "vs_currency": "usd",
                    "order": "market_cap_desc",
                    "per_page": int(body.get("perPage") or 100),
                    "page": int(body.get("page") or 1),
                },
                headers=headers,
                timeout=timeout,
            )
        elif endpoint == "coin_detail":
            if not coin_id:
                return _normalized(request=request, error="coinId or ids is required")
            data, err = await _get_json(f"{base}/coins/{coin_id}", headers=headers, timeout=timeout)
        elif endpoint == "search":
            if not query:
                return _normalized(request=request, error="query is required for search")
            data, err = await _get_json(f"{base}/search", params={"query": query}, headers=headers, timeout=timeout)
        elif endpoint == "global":
            data, err = await _get_json(f"{base}/global", headers=headers, timeout=timeout)
        elif endpoint == "exchanges":
            data, err = await _get_json(
                f"{base}/exchanges",
                params={"per_page": int(body.get("perPage") or 100)},
                headers=headers,
                timeout=timeout,
            )
        elif endpoint == "nfts_list":
            data, err = await _get_json(
                f"{base}/nfts/list",
                params={"per_page": int(body.get("perPage") or 100)},
                headers=headers,
                timeout=timeout,
            )
        elif endpoint == "onchain_networks":
            data, err = await _get_json(f"{base}/onchain/networks", headers=headers, timeout=timeout)
        elif endpoint == "coin_market_chart":
            if not coin_id:
                return _normalized(request=request, error="coinId or ids is required")
            days = str(body.get("days") or "30")
            data, err = await _get_json(
                f"{base}/coins/{coin_id}/market_chart",
                params={"vs_currency": "usd", "days": days},
                headers=headers,
                timeout=timeout,
            )
        elif endpoint == "coin_tickers":
            if not coin_id:
                return _normalized(request=request, error="coinId or ids is required")
            data, err = await _get_json(f"{base}/coins/{coin_id}/tickers", headers=headers, timeout=timeout)
        elif endpoint == "onchain_pool_ohlcv":
            if not network or not pool_address:
                return _normalized(
                    request=request,
                    error="network and poolAddress are required for onchain pool OHLCV",
                )
            request["network"] = network
            request["poolAddress"] = pool_address
            timeframe = (body.get("timeframe") or "day").strip()
            data, err = await _get_json(
                f"{base}/onchain/networks/{network}/pools/{pool_address}/ohlcv/{timeframe}",
                headers=headers,
                timeout=timeout,
            )
        else:
            return _normalized(request=request, error=f"Unknown CoinGecko endpoint: {endpoint}")

        if err:
            return _normalized(request=request, error=err)
        return _normalized(request=request, data=data)
    except Exception as exc:
        return _normalized(request=request, error=str(exc))
