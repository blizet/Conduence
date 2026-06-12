"""Publisher API key validation for external agent wrappers."""

from __future__ import annotations

from fastapi import HTTPException, status

from app.config import PUBLISHER_KEYS


def extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        return ""
    parts = authorization.strip().split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return authorization.strip()


def verify_publisher_key(agent_id: str, api_key: str) -> None:
    expected = PUBLISHER_KEYS.get(agent_id)
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No publisher key configured for agent: {agent_id}",
        )
    if not api_key or api_key != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid publisher API key",
        )
