import os
from typing import Any
from urllib.parse import urlencode

import httpx

AGENT_FETCH_TIMEOUT_MS = int(os.getenv("AGENT_FETCH_TIMEOUT_MS", "15000"))

COINDESK_BASE = "https://data-api.coindesk.com"
NEWS_V1 = f"{COINDESK_BASE}/news/v1"
COINDESK_NEWS = {
    "articleList": f"{NEWS_V1}/article/list",
    "sourceList": f"{NEWS_V1}/source/list",
    "categoryList": f"{NEWS_V1}/category/list",
    "articleGet": f"{NEWS_V1}/article/get",
    "search": f"{NEWS_V1}/search",
}
TIMEOUT = AGENT_FETCH_TIMEOUT_MS / 1000


def _coindesk_url(path: str, params: dict[str, Any] | None = None) -> str:
    if not params:
        return path
    filtered = {k: v for k, v in params.items() if v not in (None, "")}
    query = urlencode({k: str(v) for k, v in filtered.items()})
    return f"{path}?{query}" if query else path


def _parse_articles(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    obj = payload
    lst = obj.get("Data") or obj.get("data") or obj.get("articles") or obj.get("items") or []
    if not isinstance(lst, list):
        return []
    articles = []
    for item in lst:
        if not isinstance(item, dict):
            continue
        title = str(item.get("TITLE") or item.get("title") or item.get("headline") or "")
        if not title:
            continue
        articles.append(
            {
                "id": str(item.get("ID") or item.get("id") or item.get("GUID") or item.get("guid") or "") or None,
                "guid": str(item.get("GUID") or item.get("guid") or "") or None,
                "sourceId": str(item.get("SOURCE_ID") or item.get("source_id") or "") or None,
                "title": title,
                "url": str(item.get("URL") or item.get("url") or "") or None,
                "publishedAt": str(item.get("PUBLISHED_ON") or item.get("publishedAt") or "") or None,
                "source": str(item.get("SOURCE") or item.get("source") or "") or None,
                "summary": str(item.get("BODY") or item.get("summary") or "")[:280] or None,
            }
        )
    return articles


async def _coindesk_fetch(api_key: str, path: str, params: dict[str, Any] | None = None) -> Any:
    url = _coindesk_url(path, params)
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        res = await client.get(
            url,
            headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
        )
        if res.status_code >= 400:
            body = res.text[:120]
            raise RuntimeError(f"CoinDesk {res.status_code} {path}: {body}")
        return res.json()


async def fetch_latest_articles(req: dict[str, Any]) -> dict[str, Any]:
    payload = await _coindesk_fetch(
        req["apiKey"],
        COINDESK_NEWS["articleList"],
        {
            "limit": req.get("limit", 20),
            "language": req.get("language"),
            "source_id": req.get("sourceId"),
            "categories": ",".join(req["categories"]) if req.get("categories") else None,
            "exclude_categories": ",".join(req["excludeCategories"]) if req.get("excludeCategories") else None,
            "to_timestamp": req.get("toTimestamp"),
        },
    )
    return {"articles": _parse_articles(payload), "raw": payload}


async def fetch_sources(api_key: str, opts: dict[str, Any] | None = None) -> Any:
    opts = opts or {}
    return await _coindesk_fetch(
        api_key,
        COINDESK_NEWS["sourceList"],
        {"language": opts.get("language"), "source_type": opts.get("sourceType"), "status": opts.get("status")},
    )


async def fetch_categories(api_key: str, opts: dict[str, Any] | None = None) -> Any:
    opts = opts or {}
    return await _coindesk_fetch(api_key, COINDESK_NEWS["categoryList"], {"status": opts.get("status")})


async def fetch_article(req: dict[str, Any]) -> dict[str, Any]:
    payload = await _coindesk_fetch(
        req["apiKey"],
        COINDESK_NEWS["articleGet"],
        {"source_id": req["sourceId"], "guid": req["guid"]},
    )
    articles = _parse_articles(payload)
    return {"article": articles[0] if articles else None, "raw": payload}


async def search_news(req: dict[str, Any]) -> dict[str, Any]:
    payload = await _coindesk_fetch(
        req["apiKey"],
        COINDESK_NEWS["search"],
        {
            "q": req["query"],
            "query": req["query"],
            "limit": req.get("limit", 20),
            "language": req.get("language"),
            "source_id": ",".join(req["sourceIds"]) if req.get("sourceIds") else None,
            "languages": ",".join(req["languages"]) if req.get("languages") else None,
        },
    )
    return {"articles": _parse_articles(payload), "raw": payload}
