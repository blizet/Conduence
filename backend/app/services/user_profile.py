"""Local user profile storage (wallet import → graph ids)."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[3]
_PROFILES_DIR = _REPO_ROOT / "data" / "user_profiles"


def _profile_path(user_id: str) -> Path:
    safe = "".join(c for c in user_id if c.isalnum() or c in "-_")[:64]
    if not safe:
        raise ValueError("invalid user_id")
    _PROFILES_DIR.mkdir(parents=True, exist_ok=True)
    return _PROFILES_DIR / f"{safe}.json"


def load_profile(user_id: str) -> dict[str, Any] | None:
    path = _profile_path(user_id)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to read profile %s: %s", path, exc)
        return None


def save_profile(user_id: str, profile: dict[str, Any]) -> dict[str, Any]:
    path = _profile_path(user_id)
    profile = {**profile, "user_id": user_id, "updated_at": datetime.now(timezone.utc).isoformat()}
    path.write_text(json.dumps(profile, indent=2), encoding="utf-8")
    return profile


def profile_summary(profile: dict[str, Any] | None) -> dict[str, Any]:
    if not profile:
        return {"imported": False}
    return {
        "imported": bool(profile.get("wallet")),
        "user_id": profile.get("user_id"),
        "wallet": profile.get("wallet"),
        "user_slug": profile.get("user_slug"),
        "graph_id": profile.get("graph_id"),
        "imported_at": profile.get("imported_at"),
        "trade_count": profile.get("trade_count"),
        "import_limit": profile.get("import_limit"),
        "platforms": profile.get("platforms") or [],
    }
