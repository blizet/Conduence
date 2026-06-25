"""
Vercel serverless entrypoint.

NOTE: The app is now FastAPI (ASGI). Vercel's @vercel/python adapter
supports ASGI apps via the `app` export. WebRTC voice (/api/offer)
requires a persistent process and will not work in serverless mode.
"""
from __future__ import annotations

import sys
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP_DIR))

from server import app  # noqa: E402 — FastAPI ASGI app
