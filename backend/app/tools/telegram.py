"""Telegram Bot API — forward agent messages to a user's chat."""

from __future__ import annotations

from typing import Any

import httpx

from app.config import TELEGRAM_BOT_TOKEN, TOOL_FETCH_TIMEOUT_MS


def _normalized(
    *,
    request: dict[str, Any],
    data: Any = None,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "ok": error is None,
        "source": "telegram",
        "request": request,
        "data": data if error is None else None,
        "error": error,
    }


def _resolve_bot_token(body: dict[str, Any]) -> str:
    return (body.get("botToken") or body.get("apiKey") or TELEGRAM_BOT_TOKEN or "").strip()


def _resolve_chat_id(body: dict[str, Any]) -> str:
    chat_id = (body.get("chatId") or body.get("telegramChatId") or "").strip()
    if chat_id:
        return chat_id
    username = (body.get("username") or body.get("telegramUsername") or "").strip()
    if not username:
        return ""
    return username if username.startswith("@") else f"@{username}"


def format_agent_message(payload: dict[str, Any], *, prefix: str = "") -> str:
    """Turn upstream agent JSON into a Telegram-friendly text message."""
    lines: list[str] = []
    if prefix.strip():
        lines.append(prefix.strip())
        lines.append("")

    action = payload.get("action")
    if action and str(action).upper() != "HOLD":
        lines.append(f"Action: {action}")

    for key, label in (
        ("summary", "Summary"),
        ("thesis", "Thesis"),
        ("headline", "Headline"),
        ("market", "Market"),
        ("market_id", "Market ID"),
    ):
        val = payload.get(key)
        if val and str(val).strip():
            lines.append(f"{label}: {str(val).strip()[:500]}")

    for key, label in (
        ("size_usd", "Size (USD)"),
        ("count", "Contracts"),
        ("price", "Price"),
        ("confidence", "Confidence"),
    ):
        val = payload.get(key)
        if val not in (None, "", 0):
            lines.append(f"{label}: {val}")

    sentiment = payload.get("sentiment") or payload.get("direction")
    if sentiment:
        lines.append(f"Sentiment: {sentiment}")

    if not lines:
        import json

        lines.append(json.dumps(payload, indent=2)[:3500])

    text = "\n".join(lines)
    return text[:4096]


async def send_telegram_message(body: dict[str, Any]) -> dict[str, Any]:
    token = _resolve_bot_token(body)
    chat_id = _resolve_chat_id(body)
    text = (body.get("text") or body.get("message") or "").strip()

    if not text and isinstance(body.get("payload"), dict):
        text = format_agent_message(
            body["payload"],
            prefix=str(body.get("messagePrefix") or body.get("telegramMessagePrefix") or ""),
        )

    request = {
        "chatId": chat_id,
        "username": body.get("username") or body.get("telegramUsername"),
        "parseMode": body.get("parseMode") or "HTML",
        "disableNotification": bool(body.get("disableNotification")),
    }

    if not token:
        return _normalized(
            request=request,
            error="Telegram bot token is required — set on the node or TELEGRAM_BOT_TOKEN in backend/.env",
        )
    if not chat_id:
        return _normalized(
            request=request,
            error="Telegram username or chat ID is required",
        )
    if not text:
        return _normalized(request=request, error="Message text is empty")

    timeout = TOOL_FETCH_TIMEOUT_MS / 1000
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "disable_web_page_preview": True,
    }
    parse_mode = request.get("parseMode")
    if parse_mode and parse_mode != "none":
        payload["parse_mode"] = parse_mode

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=payload)
            data = response.json()
    except Exception as exc:
        return _normalized(request={**request, "textLength": len(text)}, error=str(exc))

    if not data.get("ok"):
        description = data.get("description") or f"HTTP {response.status_code}"
        hint = ""
        if "chat not found" in str(description).lower():
            hint = (
                " — for DMs, message your bot with /start first and use the numeric chat ID, "
                "or use @channel_username for public channels"
            )
        return _normalized(
            request={**request, "textLength": len(text)},
            error=f"{description}{hint}",
        )

    result = data.get("result") or {}
    return _normalized(
        request={**request, "textLength": len(text)},
        data={
            "messageId": result.get("message_id"),
            "chatId": (result.get("chat") or {}).get("id"),
            "username": (result.get("chat") or {}).get("username"),
            "date": result.get("date"),
            "textPreview": text[:240],
        },
    )
