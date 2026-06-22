"""
Thin convenience wrapper around the Zep SDK.

Everyone running this app should share one Zep project (one ZEP_API_KEY),
so `get_or_create_user` / `get_or_create_thread` are written to be safe to
call repeatedly from different machines without stepping on each other --
"already exists" errors from Zep are swallowed since that just means a
teammate (or a previous run) already created it.
"""
from __future__ import annotations

import time
import uuid

from zep_cloud.client import Zep
from zep_cloud.core.api_error import ApiError

from config import Settings


def build_client(settings: Settings) -> Zep:
    return Zep(api_key=settings.zep_api_key)


def _is_duplicate_error(exc: ApiError) -> bool:
    body = exc.body if isinstance(exc.body, dict) else {}
    message = str(body.get("message", "")).lower()
    return exc.status_code == 400 and "already exists" in message


def get_or_create_user(
    client: Zep,
    user_id: str,
    *,
    first_name: str | None = None,
    last_name: str | None = None,
    email: str | None = None,
) -> None:
    """Create the Zep user if it doesn't already exist. Idempotent."""
    try:
        client.user.add(
            user_id=user_id,
            first_name=first_name,
            last_name=last_name,
            email=email,
        )
    except ApiError as exc:
        if _is_duplicate_error(exc):
            # User already exists -- fine, this is expected on repeat runs
            # or when a teammate already created this user.
            return
        raise


def new_thread_id(user_id: str) -> str:
    return f"{user_id}-{uuid.uuid4().hex[:8]}"


def web_thread_id(user_id: str) -> str:
    """Stable thread for the shared web UI — survives server restarts."""
    return f"{user_id}-web"


def ensure_thread(client: Zep, thread_id: str, user_id: str) -> None:
    """Create the thread if needed and verify it exists in Zep.

    Retries with a short sleep to handle Zep's eventual consistency.
    """
    for attempt in range(4):
        try:
            client.thread.get(thread_id=thread_id)
            return  # confirmed exists
        except ApiError as exc:
            if exc.status_code != 404:
                raise
            # Thread not found — try to create it
            try:
                client.thread.create(thread_id=thread_id, user_id=user_id)
            except ApiError as create_exc:
                if not _is_duplicate_error(create_exc):
                    raise
            # Give Zep a moment to propagate
            time.sleep(0.5 * (attempt + 1))

    # Final verification — raise if still missing
    client.thread.get(thread_id=thread_id)


def get_or_create_thread(client: Zep, thread_id: str, user_id: str) -> None:
    ensure_thread(client, thread_id, user_id)
