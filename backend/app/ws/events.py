import json
import logging
from typing import Any

from fastapi import WebSocket
from starlette.websockets import WebSocketState

logger = logging.getLogger(__name__)


class EventsManager:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.add(websocket)
        await self.send(websocket, {"type": "connected", "message": "CoT event stream ready"})

    def disconnect(self, websocket: WebSocket) -> None:
        self._clients.discard(websocket)

    async def send(self, websocket: WebSocket, event: dict[str, Any]) -> None:
        if websocket.client_state != WebSocketState.CONNECTED:
            return
        try:
            await websocket.send_text(json.dumps(event))
        except Exception as exc:
            logger.debug("WebSocket send failed: %s", exc)
            self.disconnect(websocket)

    async def broadcast(self, event: dict[str, Any]) -> None:
        payload = json.dumps(event)
        dead: list[WebSocket] = []
        for client in list(self._clients):
            if client.client_state != WebSocketState.CONNECTED:
                dead.append(client)
                continue
            try:
                await client.send_text(payload)
            except Exception:
                dead.append(client)
        for client in dead:
            self.disconnect(client)
