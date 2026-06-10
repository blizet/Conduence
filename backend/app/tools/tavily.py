from typing import Any

import httpx

from app.config import TAVILY_API_KEY, TOOL_FETCH_TIMEOUT_MS

TAVILY_SEARCH_URL = "https://api.tavily.com/search"


def _normalized(
    *,
    request: dict[str, Any],
    data: Any = None,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "ok": error is None,
        "source": "tavily",
        "request": request,
        "data": data if error is None else None,
        "error": error,
    }


def _extract_error(payload: Any, status_code: int) -> str | None:
    if status_code >= 400:
        if isinstance(payload, dict):
            detail = payload.get("detail")
            if isinstance(detail, dict) and detail.get("error"):
                return str(detail["error"])
            if isinstance(detail, str):
                return detail
        return f"Tavily request failed ({status_code})"

    if not isinstance(payload, dict):
        return "Unexpected Tavily response"

    detail = payload.get("detail")
    if isinstance(detail, str):
        return detail
    if isinstance(detail, dict) and detail.get("error"):
        return str(detail["error"])

    if "results" not in payload and "answer" not in payload:
        return "Tavily returned no search results"

    return None


async def fetch_tavily(body: dict[str, Any]) -> dict[str, Any]:
    api_key = (body.get("apiKey") or TAVILY_API_KEY or "").strip()
    query = (body.get("query") or "").strip()
    search_depth = (body.get("searchDepth") or "basic").strip() or "basic"
    max_results = int(body.get("maxResults") or 5)

    request = {
        "query": query,
        "searchDepth": search_depth,
        "maxResults": max_results,
    }

    if not api_key:
        return _normalized(
            request=request,
            error="apiKey is required — paste your Tavily key on the node or set TAVILY_API_KEY in backend/.env",
        )
    if not query:
        return _normalized(request=request, error="query is required")

    timeout = TOOL_FETCH_TIMEOUT_MS / 1000
    payload = {
        "query": query,
        "search_depth": search_depth,
        "max_results": max_results,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(TAVILY_SEARCH_URL, json=payload, headers=headers)
            body_json = response.json()
            error = _extract_error(body_json, response.status_code)
            if error:
                return _normalized(request=request, error=error)
            return _normalized(request=request, data=body_json)
    except Exception as exc:
        return _normalized(request=request, error=str(exc))
