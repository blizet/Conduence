from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request

from app.subagents import news_coindesk as coindesk
from app.lib.normalize import normalize_decision
from app.lib.pipeline_config import PUBLISHER_AGENT_ID
from app.schemas.decision import DecisionEvent
from app.tools.clob import execute_clob_trade, get_clob_quote
from app.tools.kalshi import execute_kalshi_trade, get_kalshi_quote
from app.tools.coingecko import fetch_coingecko
from app.tools.coinmarketcap import fetch_coinmarketcap
from app.tools.cot_builder import build_cot_decision
from app.tools.cryptonews import fetch_cryptonews
from app.tools.cryptoquant import fetch_cryptoquant
from app.tools.defillama import fetch_defillama
from app.tools.polymarket_gamma import fetch_gamma_markets
from app.tools.polymarket_wallet import fetch_polymarket_wallet
from app.tools.tavily import fetch_tavily
from app.tools.telegram import send_telegram_message
from app.tools.wallet_monitor import fetch_wallet_monitor
from app.tools.x_monitor import fetch_x_monitor
from app.orchestrator.graph_registry import GRAPH_CATALOG
from app.orchestrator.runner import normalize_inbound_signal, run_orchestrator
from app.services.cot_emit import publish_cot_decision
from app.services.user_profile import load_profile, profile_summary
from app.services.wallet_import import get_user_cot_graph, import_wallet_for_user

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
        "architecture": "falkordb-direct",
        "infra": infra,
        "degraded": not infra.get("falkordb") if infra else True,
    }


@router.get("/graphs")
async def list_graphs(request: Request) -> list[str]:
    return await request.app.state.falkordb.list_graphs()


@router.get("/graphs/{graph_id}/snapshot")
async def snapshot(graph_id: str, request: Request) -> dict[str, Any]:
    return await request.app.state.falkordb.get_graph_snapshot(graph_id)


@router.get("/graphs/{graph_id}/nodes/{node_id}")
async def graph_node_detail(graph_id: str, node_id: str, request: Request) -> dict[str, Any]:
    detail = await request.app.state.falkordb.get_node_detail(graph_id, node_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Node not found")
    return detail


@router.get("/user/profile/{user_id}")
async def user_profile(user_id: str) -> dict[str, Any]:
    profile = load_profile(user_id.strip())
    return {"ok": True, **profile_summary(profile)}


@router.get("/user/graph/{user_id}")
async def user_graph(user_id: str, request: Request) -> dict[str, Any]:
    falkordb = request.app.state.falkordb
    cot = await get_user_cot_graph(user_id.strip(), falkordb)
    if not cot:
        raise HTTPException(status_code=404, detail="Wallet not imported for this user")
    return {"ok": True, "cotGraph": cot}


@router.post("/wallet/import")
async def wallet_import(request: Request, body: dict[str, Any]) -> dict[str, Any]:
    user_id = (body.get("userId") or body.get("user_id") or "").strip()
    wallet = (body.get("wallet") or "").strip()
    if not user_id:
        raise HTTPException(status_code=400, detail="userId is required")
    if not wallet:
        raise HTTPException(status_code=400, detail="wallet address is required")

    infra = getattr(request.app.state, "infra_ready", {})
    if not infra.get("falkordb"):
        raise HTTPException(
            status_code=503,
            detail="FalkorDB unavailable — start docker compose before importing wallet",
        )

    limit = int(body.get("limit") or 100)
    kalshi_api_key_id = (body.get("kalshiApiKeyId") or "").strip() or None
    kalshi_private_key_pem = (body.get("kalshiPrivateKeyPem") or "").strip() or None
    try:
        return await import_wallet_for_user(
            user_id=user_id,
            wallet=wallet,
            falkordb=request.app.state.falkordb,
            limit=limit,
            kalshi_api_key_id=kalshi_api_key_id,
            kalshi_private_key_pem=kalshi_private_key_pem,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/wallet/graph-preview")
async def wallet_graph_preview(body: dict[str, Any]) -> dict[str, Any]:
    from app.services.wallet_graph_builder import build_wallet_graph_preview

    wallet = (body.get("wallet") or "").strip()
    limit = int(body.get("limit") or 50)
    kalshi_api_key_id = (body.get("kalshiApiKeyId") or body.get("kalshi_api_key_id") or "").strip() or None
    kalshi_private_key_pem = (
        body.get("kalshiPrivateKeyPem") or body.get("kalshi_private_key_pem") or ""
    ).strip() or None
    try:
        return await build_wallet_graph_preview(
            wallet=wallet,
            limit=max(1, min(limit, 500)),
            kalshi_api_key_id=kalshi_api_key_id,
            kalshi_private_key_pem=kalshi_private_key_pem,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/signals/cot")
async def publish_cot_signal(
    request: Request,
    body: dict[str, Any],
    x_publisher_id: str | None = Header(default=None, alias="x-publisher-id"),
) -> dict[str, Any]:
    publisher_id = (x_publisher_id or "").strip() or PUBLISHER_AGENT_ID
    result = await publish_cot_decision(body, falkordb=request.app.state.falkordb)
    if not result:
        raise HTTPException(status_code=400, detail="Invalid CoT payload")
    return {
        "produced": bool(result.get("_published")),
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


@tools_router.post("/kalshi/quote")
async def kalshi_quote(body: dict[str, Any]) -> dict[str, Any]:
    ticker = (body.get("ticker") or "").strip()
    if not ticker:
        return {"ok": False, "source": "kalshi", "error": "ticker is required"}
    return await get_kalshi_quote(ticker)


@tools_router.post("/kalshi/execute")
async def kalshi_execute(body: dict[str, Any]) -> dict[str, Any]:
    ticker = (body.get("ticker") or "").strip()
    if not ticker:
        return {"error": "ticker is required"}
    return await execute_kalshi_trade(body)


@tools_router.post("/telegram/send")
async def telegram_send(body: dict[str, Any]) -> dict[str, Any]:
    return await send_telegram_message(body)


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


@tools_router.post("/x-monitor/poll")
async def x_monitor_poll(body: dict[str, Any]) -> dict[str, Any]:
    return await fetch_x_monitor(body)


@tools_router.post("/wallet-monitor/poll")
async def wallet_monitor_poll(body: dict[str, Any]) -> dict[str, Any]:
    return await fetch_wallet_monitor(body)


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


@orchestrator_router.get("/context-graphs")
async def orchestrator_context_graphs() -> dict[str, Any]:
    from app.orchestrator.graph_registry import build_graph_registry

    registry = build_graph_registry()
    by_id = {g["id"]: g for g in registry.get("available") or [] if isinstance(g, dict)}
    graphs = []
    for key, meta in GRAPH_CATALOG.items():
        spec = by_id.get(key) or {}
        graphs.append(
            {
                "id": key,
                **meta,
                "node_count": spec.get("node_count", 0),
                "edge_count": spec.get("edge_count", 0),
            }
        )
    return {"graphs": graphs}


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
    user_id = (enriched.get("userId") or enriched.get("user_id") or "").strip()
    if user_id:
        try:
            profile = load_profile(user_id)
            if profile.get("graph_id"):
                enriched.setdefault("graphId", profile["graph_id"])
                enriched.setdefault("userNodeId", profile.get("user_slug"))
                enriched.setdefault("contextGraph", "decision")
                enriched.setdefault("user_id", user_id)
        except Exception:
            pass

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


def _canvas_auto_emit_cot(canvas: dict[str, Any]) -> bool:
    for node in canvas.get("nodes") or []:
        if node.get("type") != "cotBuilder":
            continue
        data = node.get("data") or {}
        if data.get("autoEmit"):
            return True
    return False


async def _maybe_publish_orchestrator_cot(
    request: Request,
    result: dict[str, Any],
    canvas: dict[str, Any],
    config: dict[str, Any],
) -> dict[str, Any] | None:
    cot = result.get("cot")
    if not cot:
        return None
    topology = (result.get("workflow_topology") or {})
    auto_emit = topology.get("auto_emit_cot") or _canvas_auto_emit_cot(canvas) or config.get("autoEmitCot")
    if not auto_emit:
        return cot

    published = await publish_cot_decision(cot, falkordb=request.app.state.falkordb)
    return published


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
    published_cot = await _maybe_publish_orchestrator_cot(request, result, canvas, config)
    if published_cot:
        result["cot"] = published_cot
        result["cot_published"] = bool(published_cot.get("_published"))
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
    return await request.app.state.workflow_live.start(canvas, config)


@orchestrator_router.post("/stop")
async def orchestrator_stop(request: Request) -> dict[str, Any]:
    return await request.app.state.workflow_live.stop()


@orchestrator_router.get("/workflow/status")
async def workflow_live_status(request: Request) -> dict[str, Any]:
    return request.app.state.workflow_live.status()
