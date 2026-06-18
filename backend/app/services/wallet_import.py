"""Persist wallet-derived CoT graph to FalkorDB and user profile."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.falkordb.service import FalkorDbService
from app.schemas.decision import DecisionEvent
from app.services.user_profile import load_profile, save_profile
from app.services.wallet_graph_builder import (
    build_wallet_graph_preview,
    combined_graph_id,
    wallet_user_slug,
)


async def import_wallet_for_user(
    *,
    user_id: str,
    wallet: str,
    falkordb: FalkorDbService,
    limit: int = 100,
    kalshi_api_key_id: str | None = None,
    kalshi_private_key_pem: str | None = None,
) -> dict[str, Any]:
    preview = await build_wallet_graph_preview(
        wallet=wallet.strip(),
        limit=max(1, min(limit, 500)),
        kalshi_api_key_id=kalshi_api_key_id,
        kalshi_private_key_pem=kalshi_private_key_pem,
    )

    graph_id = preview["cotGraph"]["graph_id"]
    user_slug = preview["cotGraph"]["user_node_id"]
    ingest_stats: list[dict[str, Any]] = []
    ingest_errors: list[str] = []

    for decision in preview["cotGraph"].get("decisions") or []:
        try:
            event = DecisionEvent.model_validate(decision)
            result = await falkordb.merge_cot_delta(event)
            ingest_stats.append(result)
        except Exception as exc:
            ingest_errors.append(str(exc))

    snapshot = preview["cotGraph"]["snapshot"]
    snapshot_limit = _snapshot_limit_for_trades(len(preview["cotGraph"].get("decisions") or []))
    if falkordb and not ingest_errors:
        try:
            live = await falkordb.get_graph_snapshot(graph_id, snapshot_limit)
            if _snapshot_node_count(live):
                snapshot = live
        except Exception:
            pass

    now = datetime.now(timezone.utc).isoformat()
    import_limit = max(1, min(limit, 500))
    profile = save_profile(
        user_id,
        {
            "wallet": preview["wallet"],
            "user_slug": user_slug,
            "graph_id": graph_id,
            "imported_at": now,
            "import_limit": import_limit,
            "trade_count": preview.get("tradeCount"),
            "platforms": preview.get("platforms") or [],
            "cot_cache": {
                "snapshot": snapshot,
                "nodeDetails": preview["cotGraph"].get("nodeDetails") or {},
                "stats": preview["cotGraph"].get("stats") or {},
            },
        },
    )

    return {
        "ok": True,
        "profile": profile_summary_dict(profile),
        "graph_id": graph_id,
        "tradeCount": preview.get("tradeCount"),
        "ingestedDecisions": len(ingest_stats),
        "ingestErrors": ingest_errors,
        "cotGraph": {
            "graph_id": graph_id,
            "user_node_id": user_slug,
            "snapshot": snapshot,
            "nodeDetails": preview["cotGraph"].get("nodeDetails") or {},
            "stats": preview["cotGraph"].get("stats") or {},
        },
        "errors": preview.get("errors") or [],
    }


def profile_summary_dict(profile: dict[str, Any]) -> dict[str, Any]:
    from app.services.user_profile import profile_summary

    return profile_summary(profile)


def _snapshot_node_count(snapshot: dict[str, Any] | None) -> int:
    if not snapshot:
        return 0
    return sum(1 for n in snapshot.get("nodes") or [] if str(n.get("id") or "").strip())


def _snapshot_limit_for_trades(trade_count: int) -> int:
    return max(500, min(max(trade_count, 1) * 6, 10_000))


async def get_user_cot_graph(
    user_id: str,
    falkordb: FalkorDbService | None,
) -> dict[str, Any] | None:
    profile = load_profile(user_id)
    if not profile or not profile.get("wallet"):
        return None

    graph_id = str(profile.get("graph_id") or combined_graph_id(profile["wallet"]))
    cache = profile.get("cot_cache") or {}
    snapshot = cache.get("snapshot")
    node_details = cache.get("nodeDetails") or {}

    if falkordb:
        try:
            rebuild_limit = int(profile.get("import_limit") or profile.get("trade_count") or 100)
            snapshot_limit = _snapshot_limit_for_trades(rebuild_limit)
            live = await falkordb.get_graph_snapshot(graph_id, snapshot_limit)
            if _snapshot_node_count(live):
                snapshot = live
        except Exception:
            pass

    cached_nodes = _snapshot_node_count(snapshot)
    if not cached_nodes:
        try:
            rebuild_limit = int(profile.get("import_limit") or profile.get("trade_count") or 100)
            preview = await build_wallet_graph_preview(
                wallet=str(profile["wallet"]),
                limit=max(1, min(rebuild_limit, 500)),
            )
            preview_snapshot = preview["cotGraph"].get("snapshot") or {}
            if _snapshot_node_count(preview_snapshot):
                snapshot = preview_snapshot
                if not node_details:
                    node_details = preview["cotGraph"].get("nodeDetails") or {}
                save_profile(
                    user_id,
                    {
                        **profile,
                        "cot_cache": {
                            **cache,
                            "snapshot": snapshot,
                            "nodeDetails": node_details or cache.get("nodeDetails") or {},
                            "stats": cache.get("stats") or preview["cotGraph"].get("stats") or {},
                        },
                    },
                )
        except Exception:
            pass

    return {
        "graph_id": graph_id,
        "user_node_id": profile.get("user_slug") or wallet_user_slug(profile["wallet"]),
        "snapshot": snapshot or {"graph_id": graph_id, "nodes": [], "edges": []},
        "nodeDetails": node_details,
        "stats": cache.get("stats") or {},
        "wallet": profile.get("wallet"),
    }
