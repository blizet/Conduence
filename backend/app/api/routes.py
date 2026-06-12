from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request

from app.mind_agents.loader import get_coindesk_module
from app.external_agents.registry import get_external_agent
from app.lib.publisher_auth import extract_bearer_token, verify_publisher_key
from app.signal_registry import (
    MARKETPLACE_CATALOG,
    get_marketplace_agent,
    get_signal_producer,
    is_external_agent,
    list_signal_producer_feed_topics,
)

coindesk = get_coindesk_module()
from app.lib.event_sourced_config import MARKET_SIGNALS_TOPIC
from app.lib.normalize import normalize_decision
from app.lib.pipeline_config import PUBLISHER_AGENT_ID
from app.schemas.decision import DecisionEvent
from app.tools.clob import execute_clob_trade, get_clob_quote
from app.tools.coingecko import fetch_coingecko
from app.tools.coinmarketcap import fetch_coinmarketcap
from app.tools.cot_builder import build_cot_decision
from app.tools.cryptonews import fetch_cryptonews
from app.tools.cryptoquant import fetch_cryptoquant
from app.tools.defillama import fetch_defillama
from app.tools.polymarket_gamma import fetch_gamma_markets
from app.tools.polymarket_wallet import fetch_polymarket_wallet
from app.tools.tavily import fetch_tavily
from app.tools.whale_wallet import track_whale_wallets
from app.orchestrator.graph_registry import GRAPH_CATALOG
from app.orchestrator.runner import normalize_inbound_signal, run_orchestrator
from app.services.workflow_marketplace import (
    delete_workflow,
    get_workflow,
    list_workflows,
    publish_workflow,
)

router = APIRouter(prefix="/api")
orchestrator_router = APIRouter(prefix="/api/orchestrator")


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
    return {"topics": [MARKET_SIGNALS_TOPIC, *list_signal_producer_feed_topics()]}


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


@tools_router.post("/coingecko/fetch")
async def coingecko_fetch(body: dict[str, Any]) -> dict[str, Any]:
    return await fetch_coingecko(body)


@tools_router.post("/gamma/markets")
async def gamma_markets(body: dict[str, Any]) -> dict[str, Any]:
    return await fetch_gamma_markets(body)


@tools_router.post("/polymarket/wallet")
async def polymarket_wallet(body: dict[str, Any]) -> dict[str, Any]:
    return await fetch_polymarket_wallet(body)


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
feeds_router = APIRouter(prefix="/api/feeds")


@marketplace_router.get("/agents")
async def catalog() -> dict[str, Any]:
    return {"agents": MARKETPLACE_CATALOG}


@marketplace_router.get("/agents/{agent_id}/schema")
async def agent_schema(agent_id: str) -> dict[str, Any]:
    defn = get_external_agent(agent_id)
    if not defn:
        raise HTTPException(status_code=404, detail=f"No schema for agent: {agent_id}")
    return {
        "agentId": agent_id,
        "eventType": defn["eventType"],
        "feedTopic": defn["feedTopic"],
        "signalSchema": defn.get("signalSchema"),
        "ingest": {
            "signal": f"POST /api/feeds/{agent_id}/signal",
            "heartbeat": f"POST /api/feeds/{agent_id}/heartbeat",
            "auth": "Authorization: Bearer <publisher_api_key>",
        },
    }


@marketplace_router.get("/agents/{agent_id}/status")
async def agent_status(agent_id: str, request: Request) -> dict[str, Any]:
    if not get_marketplace_agent(agent_id):
        raise HTTPException(status_code=404, detail=f"Unknown agent: {agent_id}")
    if is_external_agent(agent_id):
        return request.app.state.external_feeds.status(agent_id)
    return request.app.state.autonomous_streams.status(agent_id)


@marketplace_router.post("/agents/{agent_id}/start")
async def start_agent(agent_id: str, request: Request, body: dict[str, Any] | None = None) -> dict[str, Any]:
    if is_external_agent(agent_id):
        raise HTTPException(
            status_code=400,
            detail="External agents are started by the publisher on their own infrastructure — use the HTTP wrapper",
        )
    if not get_signal_producer(agent_id):
        raise HTTPException(status_code=404, detail=f"Unknown signal producer: {agent_id}")
    return await request.app.state.autonomous_streams.start(agent_id, body or {})


@marketplace_router.post("/agents/{agent_id}/stop")
async def stop_agent(agent_id: str, request: Request) -> dict[str, Any]:
    if is_external_agent(agent_id):
        raise HTTPException(
            status_code=400,
            detail="External agents are stopped by the publisher — not controllable from the marketplace",
        )
    if not get_signal_producer(agent_id):
        raise HTTPException(status_code=404, detail=f"Unknown signal producer: {agent_id}")
    return request.app.state.autonomous_streams.stop(agent_id)


@marketplace_router.get("/workflows")
async def marketplace_workflows() -> dict[str, Any]:
    return {"workflows": list_workflows()}


@marketplace_router.get("/workflows/{workflow_id}")
async def marketplace_workflow_detail(workflow_id: str) -> dict[str, Any]:
    entry = get_workflow(workflow_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Workflow not found: {workflow_id}")
    return entry


@marketplace_router.post("/workflows")
async def marketplace_publish_workflow(body: dict[str, Any]) -> dict[str, Any]:
    result = publish_workflow(body)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "Publish failed"))
    return result


@marketplace_router.delete("/workflows/{workflow_id}")
async def marketplace_delete_workflow(workflow_id: str) -> dict[str, Any]:
    result = delete_workflow(workflow_id)
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("error", "Delete failed"))
    return result


@feeds_router.post("/{agent_id}/signal")
async def ingest_external_signal(
    agent_id: str,
    request: Request,
    body: dict[str, Any],
    authorization: str | None = Header(default=None, alias="authorization"),
) -> dict[str, Any]:
    verify_publisher_key(agent_id, extract_bearer_token(authorization))
    payload = body.get("payload")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="body.payload must be a JSON object")
    result = await request.app.state.external_feeds.ingest_signal(agent_id, payload)
    if not result.get("ok"):
        raise HTTPException(status_code=500, detail=result.get("error", "Ingest failed"))
    return result


@feeds_router.post("/{agent_id}/heartbeat")
async def external_agent_heartbeat(
    agent_id: str,
    request: Request,
    authorization: str | None = Header(default=None, alias="authorization"),
) -> dict[str, Any]:
    verify_publisher_key(agent_id, extract_bearer_token(authorization))
    result = await request.app.state.external_feeds.heartbeat(agent_id)
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("error", "Heartbeat failed"))
    return result


@orchestrator_router.get("/context-graphs")
async def orchestrator_context_graphs() -> dict[str, Any]:
    return {"graphs": [{"id": k, **v} for k, v in GRAPH_CATALOG.items()]}


def _graph_id_from_canvas(canvas: dict[str, Any]) -> str | None:
    for node in canvas.get("nodes") or []:
        if node.get("type") != "llm":
            continue
        data = node.get("data") or {}
        gid = (data.get("graphId") or "").strip()
        if gid:
            return gid
    for node in canvas.get("nodes") or []:
        if node.get("type") == "cotBuilder":
            data = node.get("data") or {}
            gid = (data.get("graphId") or "").strip()
            if gid:
                return gid
    return None


async def _enrich_orchestrator_config(request: Request, config: dict[str, Any], canvas: dict[str, Any]) -> dict[str, Any]:
    enriched = dict(config)
    graph_id = enriched.get("graphId") or _graph_id_from_canvas(canvas)
    if not graph_id:
        return enriched
    enriched["graphId"] = graph_id
    infra = getattr(request.app.state, "infra_ready", {})
    if not infra.get("falkordb"):
        return enriched
    try:
        snapshot = await request.app.state.falkordb.get_graph_snapshot(graph_id)
        enriched["decision_graph_snapshot"] = snapshot
    except Exception:
        pass
    return enriched


@orchestrator_router.post("/run")
async def orchestrator_run(request: Request, body: dict[str, Any]) -> dict[str, Any]:
    signal = normalize_inbound_signal(body.get("signal") or body)
    canvas = body.get("canvas") or {"nodes": [], "edges": []}
    config = await _enrich_orchestrator_config(request, body.get("config") or {}, canvas)
    memory = body.get("memory")
    stream = request.app.state.orchestrator_stream
    if memory is None and stream:
        memory = stream.get_memory()
    result = await run_orchestrator(signal=signal, canvas=canvas, config=config, memory=memory)
    if stream:
        stream.set_memory(result.get("memory") or stream.get_memory())
        stream._last_result = result
    return result


@orchestrator_router.get("/status")
async def orchestrator_status(request: Request) -> dict[str, Any]:
    return request.app.state.orchestrator_stream.status()


@orchestrator_router.post("/start")
async def orchestrator_start(request: Request, body: dict[str, Any]) -> dict[str, Any]:
    canvas = body.get("canvas") or {"nodes": [], "edges": []}
    config = body.get("config") or {}
    return await request.app.state.orchestrator_stream.start(canvas, config)


@orchestrator_router.post("/stop")
async def orchestrator_stop(request: Request) -> dict[str, Any]:
    return request.app.state.orchestrator_stream.stop()
