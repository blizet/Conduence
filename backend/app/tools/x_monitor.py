"""X (Twitter) monitor — track handles and surface tweets matching alert criteria."""

from __future__ import annotations

import re
from typing import Any

import httpx

from app.config import TOOL_FETCH_TIMEOUT_MS, X_BEARER_TOKEN
from app.tools.access import resolve_access, resolve_api_key

TWITTER_API_BASE = "https://api.twitter.com/2"


def _normalized(
    *,
    request: dict[str, Any],
    data: Any = None,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "ok": error is None,
        "source": "xMonitor",
        "request": request,
        "data": data if error is None else None,
        "error": error,
    }


def _split_csv(raw: str | None) -> list[str]:
    if not raw:
        return []
    parts = re.split(r"[,;\n]+", raw)
    return [p.strip().lstrip("@") for p in parts if p.strip()]


def _keyword_tokens(raw: str | None) -> list[str]:
    if not raw:
        return []
    chunks = re.split(r"[,;\n]+", raw)
    tokens: list[str] = []
    for chunk in chunks:
        piece = chunk.strip().lower()
        if not piece:
            continue
        tokens.append(piece)
        tokens.extend(word for word in re.split(r"\s+", piece) if len(word) >= 3)
    return list(dict.fromkeys(tokens))


def _tweet_matches(text: str, criteria_tokens: list[str], topic_tokens: list[str]) -> tuple[bool, list[str]]:
    lowered = text.lower()
    matched: list[str] = []
    for token in criteria_tokens + topic_tokens:
        if token and token in lowered:
            matched.append(token)
    if not criteria_tokens and not topic_tokens:
        return True, []
    if criteria_tokens and topic_tokens:
        has_criteria = any(token in lowered for token in criteria_tokens)
        has_topic = any(token in lowered for token in topic_tokens)
        return has_criteria and has_topic, matched
    if criteria_tokens:
        return any(token in lowered for token in criteria_tokens), matched
    return any(token in lowered for token in topic_tokens), matched


async def _resolve_user_id(client: httpx.AsyncClient, username: str, bearer: str) -> str | None:
    res = await client.get(
        f"{TWITTER_API_BASE}/users/by/username/{username}",
        headers={"Authorization": f"Bearer {bearer}"},
        params={"user.fields": "username,name"},
    )
    if res.status_code >= 400:
        return None
    payload = res.json() if res.content else {}
    data = payload.get("data") if isinstance(payload, dict) else None
    if isinstance(data, dict):
        user_id = data.get("id")
        return str(user_id) if user_id else None
    return None


async def _fetch_user_tweets(
    client: httpx.AsyncClient,
    user_id: str,
    bearer: str,
    *,
    limit: int,
) -> list[dict[str, Any]]:
    res = await client.get(
        f"{TWITTER_API_BASE}/users/{user_id}/tweets",
        headers={"Authorization": f"Bearer {bearer}"},
        params={
            "max_results": min(max(limit, 5), 100),
            "tweet.fields": "created_at,public_metrics,lang",
            "exclude": "retweets,replies",
        },
    )
    if res.status_code >= 400:
        return []
    payload = res.json() if res.content else {}
    rows = payload.get("data") if isinstance(payload, dict) else []
    return rows if isinstance(rows, list) else []


async def fetch_x_monitor(body: dict[str, Any]) -> dict[str, Any]:
    access_mode, endpoint, access_error = resolve_access("xMonitor", body, default_endpoint="poll")
    usernames = _split_csv(body.get("usernames") or body.get("xMonitorUsernames"))
    alert_criteria = (body.get("alertCriteria") or body.get("xMonitorAlertCriteria") or "").strip()
    topics = (body.get("topics") or body.get("xMonitorTopics") or "").strip()
    limit = int(body.get("limit") or body.get("xMonitorLimit") or 10)
    bearer = resolve_api_key("xMonitor", body) or X_BEARER_TOKEN

    request = {
        "accessMode": access_mode,
        "endpoint": endpoint,
        "usernames": usernames,
        "alertCriteria": alert_criteria,
        "topics": topics,
        "limit": limit,
    }

    if access_error:
        return _normalized(request=request, error=access_error)
    if not usernames:
        return _normalized(request=request, error="At least one X username is required")
    if not alert_criteria and not topics:
        return _normalized(
            request=request,
            error="Describe alert criteria and/or topics to match — e.g. 'breaking news, ETF rulings' and 'bitcoin, ethereum'",
        )

    criteria_tokens = _keyword_tokens(alert_criteria)
    topic_tokens = _keyword_tokens(topics)

    if endpoint == "configure":
        return _normalized(
            request=request,
            data={
                "configured": True,
                "usernames": usernames,
                "alertCriteria": alert_criteria,
                "topics": topics,
                "criteriaTokens": criteria_tokens,
                "topicTokens": topic_tokens,
                "hasBearerToken": bool(bearer),
            },
        )

    if not bearer:
        return _normalized(
            request=request,
            error="X Bearer token is required — set apiKey on the node or X_BEARER_TOKEN in backend/.env",
        )

    timeout = TOOL_FETCH_TIMEOUT_MS / 1000
    alerts: list[dict[str, Any]] = []
    errors: list[str] = []

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            for username in usernames[:8]:
                user_id = await _resolve_user_id(client, username, bearer)
                if not user_id:
                    errors.append(f"Could not resolve @{username}")
                    continue
                tweets = await _fetch_user_tweets(client, user_id, bearer, limit=limit)
                for tweet in tweets:
                    if not isinstance(tweet, dict):
                        continue
                    text = str(tweet.get("text") or "")
                    matched, matched_tokens = _tweet_matches(text, criteria_tokens, topic_tokens)
                    if not matched:
                        continue
                    metrics = tweet.get("public_metrics") if isinstance(tweet.get("public_metrics"), dict) else {}
                    alerts.append(
                        {
                            "username": username,
                            "tweetId": tweet.get("id"),
                            "text": text,
                            "createdAt": tweet.get("created_at"),
                            "url": f"https://x.com/{username}/status/{tweet.get('id')}",
                            "matchedTokens": matched_tokens,
                            "metrics": metrics,
                        }
                    )
    except Exception as exc:
        return _normalized(request=request, error=str(exc))

    alerts.sort(key=lambda row: str(row.get("createdAt") or ""), reverse=True)

    return _normalized(
        request=request,
        data={
            "alerts": alerts[:limit],
            "alertCount": len(alerts[:limit]),
            "monitoredUsernames": usernames,
            "errors": errors,
        },
    )
