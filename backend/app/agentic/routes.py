"""Agentic graph chat API — LLM-driven weighted causal graphs with Supermemory persistence."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.agentic.config import (
    LLM_PROVIDERS,
    env_llm_defaults,
    is_supermemory_configured,
    resolve_container_tag,
    resolve_llm_config,
)
from app.agentic.shared_graph import (
    agentic_chat_mutations_enabled,
    load_shared_agentic_graph,
    load_user_agentic_graph,
    shared_graph_container_tag,
)
from app.agentic.graph import graph_is_complete, pending_weight_questions
from app.agentic.session import (
    create_session,
    get_session,
    handle_chat,
    reset_session,
    update_edge_weight,
)
from app.agentic.tokens import empty_conversation_usage

router = APIRouter(prefix="/api/agentic", tags=["agentic"])


class LlmSettingsInput(BaseModel):
    provider: str | None = None
    apiKey: str | None = None
    model: str | None = None


class ChatRequest(BaseModel):
    sessionId: str | None = None
    message: str
    llm: LlmSettingsInput | None = None
    userSlug: str | None = None


class ResetRequest(BaseModel):
    sessionId: str | None = None
    fresh: bool = False
    userSlug: str | None = None


class EdgeWeightRequest(BaseModel):
    sessionId: str
    edgeId: str
    weight: float
    userSlug: str | None = None


@router.get("/health")
async def agentic_health() -> dict[str, Any]:
    env_fallback = resolve_llm_config(None, env_llm_defaults())
    return {
        "ok": True,
        "supermemoryConfigured": is_supermemory_configured(),
        "envFallbackConfigured": bool(env_fallback),
        "providers": LLM_PROVIDERS,
        "sharedGraphContainer": shared_graph_container_tag(),
        "graphChatMutations": agentic_chat_mutations_enabled(shared_graph_container_tag()),
    }


@router.get("/graph")
async def agentic_graph(userSlug: str | None = None) -> dict[str, Any]:
    slug = (userSlug or "").strip()
    if slug:
        container_tag = resolve_container_tag(slug)
        graph, supermemory_loaded, is_template = await load_user_agentic_graph(slug)
        return {
            "ok": True,
            "containerTag": container_tag,
            "graph": graph,
            "supermemoryLoaded": supermemory_loaded,
            "isTemplate": is_template,
            "graphComplete": graph_is_complete(graph),
            "pendingWeights": pending_weight_questions(graph),
        }

    container_tag = shared_graph_container_tag()
    graph, supermemory_loaded = await load_shared_agentic_graph(container_tag)
    return {
        "ok": True,
        "containerTag": container_tag,
        "graph": graph,
        "supermemoryLoaded": supermemory_loaded,
        "isTemplate": True,
        "graphComplete": graph_is_complete(graph),
        "pendingWeights": pending_weight_questions(graph),
    }


@router.get("/graph/template")
async def agentic_template_graph() -> dict[str, Any]:
    container_tag = shared_graph_container_tag()
    graph, supermemory_loaded = await load_shared_agentic_graph(container_tag)
    return {
        "ok": True,
        "containerTag": container_tag,
        "graph": graph,
        "supermemoryLoaded": supermemory_loaded,
        "graphComplete": graph_is_complete(graph),
        "pendingWeights": pending_weight_questions(graph),
    }


@router.get("/session")
async def agentic_session(id: str) -> dict[str, Any]:
    session = get_session(id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "sessionId": session.id,
        "messages": session.messages,
        "graph": session.graph,
        "tokenUsage": session.token_usage,
    }


@router.post("/chat")
async def agentic_chat(body: ChatRequest) -> dict[str, Any]:
    message = body.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    llm = resolve_llm_config(
        body.llm.model_dump() if body.llm else None,
        env_llm_defaults(),
    )
    if not llm:
        raise HTTPException(
            status_code=400,
            detail=(
                "No API key provided. Choose a provider in Session & LLM and paste your key, "
                "or set AGENTIC_LLM_API_KEY in backend/.env as a fallback."
            ),
        )

    container_tag = resolve_container_tag(body.userSlug)
    return await handle_chat(body.sessionId, message, llm, container_tag, user_slug=body.userSlug)


@router.post("/reset")
async def agentic_reset(body: ResetRequest) -> dict[str, Any]:
    container_tag = resolve_container_tag(body.userSlug)
    session = await reset_session(body.sessionId, container_tag, body.fresh, user_slug=body.userSlug)
    return {
        "sessionId": session.id,
        "messages": session.messages,
        "graph": session.graph,
        "tokenUsage": session.token_usage,
        "supermemoryLoaded": session.supermemory_loaded,
        "graphComplete": graph_is_complete(session.graph),
        "pendingWeights": pending_weight_questions(session.graph),
    }


@router.post("/edge-weight")
async def agentic_edge_weight(body: EdgeWeightRequest) -> dict[str, Any]:
    if not body.sessionId.strip():
        raise HTTPException(status_code=400, detail="sessionId is required")
    if not body.edgeId.strip():
        raise HTTPException(status_code=400, detail="edgeId is required")

    container_tag = resolve_container_tag(body.userSlug)
    result = await update_edge_weight(body.sessionId, body.edgeId, body.weight, container_tag)
    if not result:
        raise HTTPException(status_code=404, detail="Session or edge not found")
    return result
