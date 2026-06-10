import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import agents_router, marketplace_router, router, tools_router
from app.config import PORT
from app.falkordb.service import FalkorDbService
from app.kafka.producer import SignalProducerService
from app.kafka.worker import MainWorkerService
from app.services.autonomous_stream import AutonomousAgentStreamService
from app.services.ingress import SignalIngressService
from app.ws.events import EventsManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    events = EventsManager()
    falkordb = FalkorDbService()
    producer = SignalProducerService()
    ingress = SignalIngressService(producer, events)
    autonomous_streams = AutonomousAgentStreamService(producer, events)
    main_worker = MainWorkerService(falkordb, events)

    app.state.infra_ready = {"falkordb": False, "kafka": False}

    try:
        await falkordb.connect()
        app.state.infra_ready["falkordb"] = True
    except Exception as exc:
        logger.warning("FalkorDB unavailable (%s) — graph endpoints disabled until docker compose is up", exc)

    try:
        await producer.start()
        app.state.infra_ready["kafka"] = True
        await main_worker.start()
    except Exception as exc:
        logger.warning("Kafka unavailable (%s) — signal ingest/workers disabled until docker compose is up", exc)

    app.state.events = events
    app.state.falkordb = falkordb
    app.state.producer = producer
    app.state.ingress = ingress
    app.state.autonomous_streams = autonomous_streams
    app.state.main_worker = main_worker

    logger.info("CoT backend (FastAPI) listening on http://localhost:%s", PORT)
    logger.info("WebSocket: ws://localhost:%s/ws", PORT)

    yield

    await autonomous_streams.shutdown()
    await main_worker.stop()
    await producer.stop()
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
app.include_router(marketplace_router)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    events: EventsManager = app.state.events
    await events.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        events.disconnect(websocket)
