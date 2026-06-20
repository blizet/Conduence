import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    agents_router,
    orchestrator_router,
    router,
    tools_router,
)
from app.agentic.routes import router as agentic_router
from app.config import PORT
from app.falkordb.service import FalkorDbService
from app.services.autonomous_stream import AutonomousAgentStreamService
from app.services.orchestrator_stream import OrchestratorStreamService
from app.services.workflow_live import WorkflowLiveService
from app.ws.events import EventsManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    events = EventsManager()
    falkordb = FalkorDbService()
    orchestrator_stream = OrchestratorStreamService(events)
    autonomous_streams = AutonomousAgentStreamService(events, orchestrator_stream, falkordb=falkordb)
    workflow_live = WorkflowLiveService(orchestrator_stream, autonomous_streams, falkordb=falkordb)

    app.state.infra_ready = {"falkordb": False}

    try:
        await falkordb.connect()
        app.state.infra_ready["falkordb"] = True
    except Exception as exc:
        logger.warning(
            "FalkorDB unavailable (%s) — graph endpoints disabled until docker compose is up",
            exc,
        )

    app.state.events = events
    app.state.falkordb = falkordb
    app.state.autonomous_streams = autonomous_streams
    app.state.orchestrator_stream = orchestrator_stream
    app.state.workflow_live = workflow_live

    logger.info("CoT backend (FastAPI) listening on http://localhost:%s", PORT)
    logger.info("WebSocket: ws://localhost:%s/ws", PORT)

    yield

    orchestrator_stream.stop()
    await workflow_live.stop()
    await autonomous_streams.shutdown()
    await falkordb.close()


app = FastAPI(title="CoT Knowledge Base API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(tools_router)
app.include_router(agents_router)
app.include_router(orchestrator_router)
app.include_router(agentic_router)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    events: EventsManager = app.state.events
    await events.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        events.disconnect(websocket)
