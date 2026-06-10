from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request

from app.agents import coindesk
from app.agents.registry import MARKETPLACE_CATALOG, get_autonomous_agent, list_autonomous_agent_feed_topics
from app.lib.event_sourced_config import MARKET_SIGNALS_TOPIC
from app.lib.normalize import normalize_decision
from app.lib.pipeline_config import PUBLISHER_AGENT_ID
from app.schemas.decision import DecisionEvent
from app.tools.clob import execute_clob_trade, get_clob_quote
from app.tools.coinmarketcap import fetch_coinmarketcap
from app.tools.cot_builder import build_cot_decision
from app.tools.cryptonews import fetch_cryptonews
from app.tools.cryptoquant import fetch_cryptoquant
from app.tools.defillama import fetch_defillama
from app.tools.tavily import fetch_tavily
from app.tools.whale_wallet import track_whale_wallets

router = APIRouter(prefix="/api")


def _require_api_key(api_key: str | None) -> str | dict[str, str]:
    key = (api_key or "").strip()
    if not key:
        return {"error": "apiKey is required — provide your CoinDesk Data API key"}
    return key


@router.get("/health")
async def health(request: Request) -> dict[str, Any]:
    infra = getattr(request.app.state, "infra_ready", {})
    return {
        "ok": True,
        "service": "cot-backend",
        "architecture": "event-sourced",
        "infra": infra,
        "degraded": not all(infra.values()) if infra else True,
    }


@router.get("/topics")
async def topics() -> dict[str, list[str]]:
    return {"topics": [MARKET_SIGNALS_TOPIC, *list_autonomous_agent_feed_topics()]}


@router.get("/graphs")
async def list_graphs(request: Request) -> list[str]:
    return await request.app.state.falkordb.list_graphs()


@router.get("/graphs/{graph_id}/snapshot")
async def snapshot(graph_id: str, request: Request) -> dict[str, Any]:
    return await request.app.state.falkordb.get_graph_snapshot(graph_id)


@router.post("/signals/cot")
async def publish_cot_signal(
    request: Request,
    body: dict[str, Any],
    x_publisher_id: str | None = Header(default=None, alias="x-publisher-id"),
) -> dict[str, Any]:
    publisher_id = (x_publisher_id or "").strip() or PUBLISHER_AGENT_ID
    result = await request.app.state.ingress.publish_publisher_cot_delta(body, publisher_id)
    return {
        "produced": True,
        "topic": result["topic"],
        "graph_id": result["graph_id"],
        "decision_id": result["decision_id"],
        "publisher_id": publisher_id,
    }


@router.post("/decisions")
async def publish_decision_legacy(
    request: Request,
    body: dict[str, Any],
    x_publisher_id: str | None = Header(default=None, alias="x-publisher-id"),
) -> dict[str, Any]:
    return await publish_cot_signal(request, body, x_publisher_id)


@router.post("/decisions/ingest")
async def ingest_direct_deprecated() -> dict[str, str]:
    return {
        "error": "Direct ingest disabled. POST /api/signals/cot to produce to Redpanda; workers MERGE into FalkorDB.",
        "alternative": "/api/signals/cot",
    }


tools_router = APIRouter(prefix="/api/tools")


@tools_router.post("/clob/quote")
async def clob_quote(body: dict[str, Any]) -> dict[str, Any]:
    token_id = (body.get("tokenId") or "").strip()
    if not token_id:
        return {"error": "tokenId is required"}
    return await get_clob_quote(token_id)


@tools_router.post("/clob/execute")
async def clob_execute(body: dict[str, Any]) -> dict[str, Any]:
    token_id = (body.get("tokenId") or "").strip()
    if not token_id:
        return {"error": "tokenId is required"}
    return await execute_clob_trade(body)


@tools_router.post("/cot/build")
async def cot_build(body: dict[str, Any]) -> dict[str, Any]:
    decision = body.get("decision") or {}
    if decision.get("action") == "HOLD":
        return {"hold": True, "message": "HOLD decisions do not emit CoT"}

    draft = build_cot_decision(
        decision,
        body.get("correlated") or {},
        {"graphId": body.get("graphId"), "userNodeId": body.get("userNodeId")},
    )
    if not draft:
        return {"hold": True, "message": "No CoT produced for this decision"}

    event = DecisionEvent.model_validate(draft)
    cot = normalize_decision(event)
    return {"cot": cot.model_dump()}


@tools_router.post("/whale/track")
async def whale_track(body: dict[str, Any]) -> dict[str, Any]:
    return await track_whale_wallets(body)


@tools_router.post("/coinmarketcap/fetch")
async def coinmarketcap_fetch(body: dict[str, Any]) -> dict[str, Any]:
    return await fetch_coinmarketcap(body)


@tools_router.post("/defillama/fetch")
async def defillama_fetch(body: dict[str, Any]) -> dict[str, Any]:
    return await fetch_defillama(body)


@tools_router.post("/cryptonews/fetch")
async def cryptonews_fetch(body: dict[str, Any]) -> dict[str, Any]:
    return await fetch_cryptonews(body)


@tools_router.post("/cryptoquant/fetch")
async def cryptoquant_fetch(body: dict[str, Any]) -> dict[str, Any]:
    return await fetch_cryptoquant(body)


@tools_router.post("/tavily/fetch")
async def tavily_fetch(body: dict[str, Any]) -> dict[str, Any]:
    return await fetch_tavily(body)


agents_router = APIRouter(prefix="/api/agents")


@agents_router.post("/coindesk/articles/list")
async def latest_articles(body: dict[str, Any]) -> dict[str, Any]:
    key = _require_api_key(body.get("apiKey"))
    if isinstance(key, dict):
        return key
    return await coindesk.fetch_latest_articles({**body, "apiKey": key})


@agents_router.post("/coindesk/news")
async def coindesk_news(body: dict[str, Any]) -> dict[str, Any]:
    key = _require_api_key(body.get("apiKey"))
    if isinstance(key, dict):
        return key
    return await coindesk.fetch_latest_articles({"apiKey": key, "limit": body.get("limit", 20)})


@agents_router.post("/coindesk/sources")
async def coindesk_sources(body: dict[str, Any]) -> Any:
    key = _require_api_key(body.get("apiKey"))
    if isinstance(key, dict):
        return key
    return await coindesk.fetch_sources(key, body)


@agents_router.post("/coindesk/categories")
async def coindesk_categories(body: dict[str, Any]) -> Any:
    key = _require_api_key(body.get("apiKey"))
    if isinstance(key, dict):
        return key
    return await coindesk.fetch_categories(key, body)


@agents_router.post("/coindesk/article/get")
async def coindesk_article_get(body: dict[str, Any]) -> dict[str, Any]:
    key = _require_api_key(body.get("apiKey"))
    if isinstance(key, dict):
        return key
    if not (body.get("sourceId") or "").strip() or not (body.get("guid") or "").strip():
        return {"error": "sourceId and guid are required"}
    return await coindesk.fetch_article({**body, "apiKey": key})


@agents_router.post("/coindesk/search")
async def coindesk_search(body: dict[str, Any]) -> dict[str, Any]:
    key = _require_api_key(body.get("apiKey"))
    if isinstance(key, dict):
        return key
    if not (body.get("query") or "").strip():
        return {"error": "query is required"}
    return await coindesk.search_news({**body, "apiKey": key, "query": body["query"].strip()})


marketplace_router = APIRouter(prefix="/api/marketplace")


@marketplace_router.get("/agents")
async def catalog() -> dict[str, Any]:
    return {"agents": MARKETPLACE_CATALOG}


@marketplace_router.get("/agents/{agent_id}/status")
async def agent_status(agent_id: str, request: Request) -> dict[str, Any]:
    if not get_autonomous_agent(agent_id):
        raise HTTPException(status_code=404, detail=f"Unknown autonomous agent: {agent_id}")
    return request.app.state.autonomous_streams.status(agent_id)


@marketplace_router.post("/agents/{agent_id}/start")
async def start_agent(agent_id: str, request: Request, body: dict[str, Any] | None = None) -> dict[str, Any]:
    if not get_autonomous_agent(agent_id):
        raise HTTPException(status_code=404, detail=f"Unknown autonomous agent: {agent_id}")
    return await request.app.state.autonomous_streams.start(agent_id, body or {})


@marketplace_router.post("/agents/{agent_id}/stop")
async def stop_agent(agent_id: str, request: Request) -> dict[str, Any]:
    if not get_autonomous_agent(agent_id):
        raise HTTPException(status_code=404, detail=f"Unknown autonomous agent: {agent_id}")
    return request.app.state.autonomous_streams.stop(agent_id)
