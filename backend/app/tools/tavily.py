from typing import Any

import httpx

from app.config import TOOL_FETCH_TIMEOUT_MS
from app.tools.access import resolve_access, resolve_api_key

TAVILY_SEARCH_URL = "https://api.tavily.com/search"
TAVILY_EXTRACT_URL = "https://api.tavily.com/extract"


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
        if payload.get("error"):
            return str(payload["error"])
    return None


async def fetch_tavily(body: dict[str, Any]) -> dict[str, Any]:
    access_mode, endpoint, access_error = resolve_access("tavily", body, default_endpoint="search")
    api_key = resolve_api_key("tavily", body)
    query = (body.get("query") or "").strip()
    urls = body.get("urls") or []
    if isinstance(urls, str):
        urls = [u.strip() for u in urls.split(",") if u.strip()]
    search_depth = (body.get("searchDepth") or "basic").strip() or "basic"
    max_results = int(body.get("maxResults") or 5)

    request: dict[str, Any] = {
        "accessMode": access_mode,
        "endpoint": endpoint,
        "query": query,
        "searchDepth": search_depth,
        "maxResults": max_results,
        "urls": urls or None,
    }

    if access_error:
        return _normalized(request=request, error=access_error)

    timeout = TOOL_FETCH_TIMEOUT_MS / 1000
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}

    if endpoint == "search":
        if not query:
            return _normalized(request=request, error="query is required")
        payload_body = {
            "query": query,
            "search_depth": search_depth,
            "max_results": max_results,
        }
        url = TAVILY_SEARCH_URL
    elif endpoint == "extract":
        if not urls:
            return _normalized(request=request, error="urls is required (comma-separated)")
        payload_body = {"urls": urls}
        url = TAVILY_EXTRACT_URL
    else:
        return _normalized(request=request, error=f"Unknown Tavily endpoint: {endpoint}")

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=payload_body, headers=headers)
            body_json = response.json()
            error = _extract_error(body_json, response.status_code)
            if error:
                return _normalized(request=request, error=error)
            return _normalized(request=request, data=body_json)
    except Exception as exc:
        return _normalized(request=request, error=str(exc))
