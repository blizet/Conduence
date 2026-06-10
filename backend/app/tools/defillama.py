from typing import Any

import httpx

from app.config import DEFILLAMA_API_KEY, TOOL_FETCH_TIMEOUT_MS

DEFILLAMA_FREE_BASE_URL = "https://api.llama.fi"
DEFILLAMA_PRO_BASE_URL = "https://pro-api.llama.fi"

FREE_MODES = frozenset(
    {"protocols", "protocol", "tvl", "chains", "historicalChainTvl", "chain"}
)
PRO_MODES = frozenset({"tokenProtocols"})


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
    return None


def _missing_field_error(mode: str) -> str:
    if mode in {"protocol", "tvl"}:
        return "protocol is required for this endpoint"
    if mode == "chain":
        return "chain is required for this endpoint"
    if mode == "tokenProtocols":
        return "symbol is required for tokenProtocols"
    return "invalid request parameters"


async def fetch_defillama(body: dict[str, Any]) -> dict[str, Any]:
    mode = (body.get("mode") or "protocols").strip() or "protocols"
    api_key = (body.get("apiKey") or DEFILLAMA_API_KEY or "").strip()
    request: dict[str, Any] = {"mode": mode}

    if mode in FREE_MODES:
        url = _resolve_free_url(mode, body, request)
        if url is None:
            return _normalized(request=request, error=_missing_field_error(mode))
    elif mode in PRO_MODES:
        if not api_key:
            return _normalized(
                request=request,
                error="DefiLlama Pro API key is required for this endpoint",
            )
        request["apiKey"] = "***"
        url = _resolve_pro_url(mode, body, request, api_key)
        if url is None:
            return _normalized(request=request, error=_missing_field_error(mode))
    else:
        return _normalized(
            request=request,
            error=(
                "mode must be one of: protocols, protocol, tvl, chains, "
                "historicalChainTvl, chain, tokenProtocols"
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
