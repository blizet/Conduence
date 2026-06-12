from typing import Any

import httpx

from app.config import DEFILLAMA_API_KEY, TOOL_FETCH_TIMEOUT_MS
from app.tools.access import resolve_access, resolve_api_key

DEFILLAMA_FREE_BASE_URL = "https://api.llama.fi"
DEFILLAMA_PRO_BASE_URL = "https://pro-api.llama.fi"

PUBLIC_MODES = frozenset({"protocols", "protocol", "tvl", "chains", "historicalChainTvl", "chain"})
PRIVATE_MODES = frozenset({"tokenProtocols", "inflows", "chainAssets"})


def _normalized(
    *,
    request: dict[str, Any],
    data: Any = None,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "ok": error is None,
        "source": "defillama",
        "request": request,
        "data": data if error is None else None,
        "error": error,
    }


def _resolve_free_url(mode: str, body: dict[str, Any], request: dict[str, Any]) -> str | None:
    if mode == "protocols":
        return f"{DEFILLAMA_FREE_BASE_URL}/protocols"
    if mode == "protocol":
        protocol = (body.get("protocol") or "").strip()
        request["protocol"] = protocol
        if not protocol:
            return None
        return f"{DEFILLAMA_FREE_BASE_URL}/protocol/{protocol}"
    if mode == "tvl":
        protocol = (body.get("protocol") or "").strip()
        request["protocol"] = protocol
        if not protocol:
            return None
        return f"{DEFILLAMA_FREE_BASE_URL}/tvl/{protocol}"
    if mode == "chains":
        return f"{DEFILLAMA_FREE_BASE_URL}/v2/chains"
    if mode == "historicalChainTvl":
        return f"{DEFILLAMA_FREE_BASE_URL}/v2/historicalChainTvl"
    if mode == "chain":
        chain = (body.get("chain") or "").strip()
        request["chain"] = chain
        if not chain:
            return None
        return f"{DEFILLAMA_FREE_BASE_URL}/v2/historicalChainTvl/{chain}"
    return None


def _resolve_pro_url(
    mode: str, body: dict[str, Any], request: dict[str, Any], api_key: str
) -> str | None:
    if mode == "tokenProtocols":
        symbol = (body.get("symbol") or "").strip().lower()
        request["symbol"] = symbol
        if not symbol:
            return None
        return f"{DEFILLAMA_PRO_BASE_URL}/{api_key}/api/tokenProtocols/{symbol}"
    if mode == "inflows":
        protocol = (body.get("protocol") or "").strip()
        timestamp = (body.get("timestamp") or "").strip()
        request["protocol"] = protocol
        request["timestamp"] = timestamp
        if not protocol or not timestamp:
            return None
        return f"{DEFILLAMA_PRO_BASE_URL}/{api_key}/api/inflows/{protocol}/{timestamp}"
    if mode == "chainAssets":
        return f"{DEFILLAMA_PRO_BASE_URL}/{api_key}/api/chainAssets"
    return None


def _missing_field_error(mode: str) -> str:
    if mode in {"protocol", "tvl", "inflows"}:
        return "protocol is required for this endpoint"
    if mode == "chain":
        return "chain is required for this endpoint"
    if mode == "tokenProtocols":
        return "symbol is required for tokenProtocols"
    if mode == "inflows":
        return "protocol and timestamp are required for inflows"
    return "invalid request parameters"


async def fetch_defillama(body: dict[str, Any]) -> dict[str, Any]:
    endpoint = (body.get("endpoint") or body.get("mode") or "protocols").strip() or "protocols"
    body_with_endpoint = {**body, "endpoint": endpoint, "mode": endpoint}
    access_mode, endpoint, access_error = resolve_access(
        "defillama", body_with_endpoint, default_endpoint="protocols"
    )
    api_key = resolve_api_key("defillama", body)
    request: dict[str, Any] = {"accessMode": access_mode, "endpoint": endpoint, "mode": endpoint}

    if access_error:
        return _normalized(request=request, error=access_error)

    if endpoint in PUBLIC_MODES:
        url = _resolve_free_url(endpoint, body, request)
        if url is None:
            return _normalized(request=request, error=_missing_field_error(endpoint))
    elif endpoint in PRIVATE_MODES:
        if not api_key:
            return _normalized(
                request=request,
                error="DefiLlama Pro API key is required for this endpoint",
            )
        request["apiKey"] = "***"
        url = _resolve_pro_url(endpoint, body, request, api_key)
        if url is None:
            return _normalized(request=request, error=_missing_field_error(endpoint))
    else:
        return _normalized(
            request=request,
            error=(
                "endpoint must be one of: protocols, protocol, tvl, chains, "
                "historicalChainTvl, chain, tokenProtocols, inflows, chainAssets"
            ),
        )

    timeout = TOOL_FETCH_TIMEOUT_MS / 1000
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url)
            if response.status_code >= 400:
                detail = response.text.strip()[:200] or f"HTTP {response.status_code}"
                return _normalized(
                    request=request,
                    error=f"DefiLlama request failed ({response.status_code}): {detail}",
                )
            payload = response.json()
            return _normalized(request=request, data=payload)
    except Exception as exc:
        return _normalized(request=request, error=str(exc))
