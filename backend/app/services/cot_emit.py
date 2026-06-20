"""Publish CoT decision events to FalkorDB."""

from __future__ import annotations

import logging
from typing import Any

from app.lib.normalize import normalize_decision
from app.schemas.decision import DecisionEvent

logger = logging.getLogger(__name__)


async def publish_cot_decision(
    draft: dict[str, Any],
    *,
    falkordb: Any | None = None,
) -> dict[str, Any] | None:
    """Normalize and MERGE a CoT decision into FalkorDB."""
    if not draft:
        return None

    try:
        event = DecisionEvent.model_validate(draft)
        normalized = normalize_decision(event).model_dump()
    except Exception as exc:
        logger.warning("CoT validation failed: %s", exc)
        return None

    published = False
    if falkordb is not None:
        try:
            await falkordb.merge_cot_delta(event)
            published = True
        except Exception as exc:
            logger.warning("CoT FalkorDB merge failed: %s", exc)

    normalized["_published"] = published
    return normalized
