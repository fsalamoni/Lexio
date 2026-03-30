"""Lexio Core — WebSocket progress manager (document_id based)."""

import json
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger("lexio.websocket")


class ProgressManager:
    """Manages WebSocket connections for real-time pipeline progress."""

    def __init__(self):
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, document_id: str, ws: WebSocket):
        await ws.accept()
        self._connections[document_id].append(ws)
        logger.info(f"WS connected: document={document_id}")

    def disconnect(self, document_id: str, ws: WebSocket):
        if document_id in self._connections:
            self._connections[document_id] = [
                c for c in self._connections[document_id] if c != ws
            ]
            if not self._connections[document_id]:
                del self._connections[document_id]

    async def send(self, document_id: str, data: dict):
        if document_id not in self._connections:
            return
        dead = []
        for ws in self._connections[document_id]:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(document_id, ws)

    @property
    def active_connections(self) -> int:
        return sum(len(v) for v in self._connections.values())


progress_manager = ProgressManager()
