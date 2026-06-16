"""Edge weight parsing and formatting for agentic graphs."""

from __future__ import annotations

import re
from typing import Any

WORD_MAGNITUDES: dict[str, float] = {
    "none": 0,
    "negligible": 0.1,
    "weak": 0.25,
    "low": 0.3,
    "mild": 0.35,
    "moderate": 0.5,
    "medium": 0.55,
    "strong": 0.75,
    "high": 0.8,
    "very": 0.85,
    "extreme": 0.95,
    "certain": 1,
    "full": 1,
}


def clamp_weight(value: float) -> float:
    if value != value:  # NaN
        return 0.0
    return max(-1.0, min(1.0, value))


def _parse_magnitude(text: str) -> float | None:
    fraction = re.search(r"(\d+(?:\.\d+)?)\s*/\s*10", text)
    if fraction:
        return clamp_weight(float(fraction.group(1)) / 10)

    percent = re.search(r"(\d+(?:\.\d+)?)\s*%", text)
    if percent:
        return clamp_weight(float(percent.group(1)) / 100)

    signed = re.search(r"([+-])\s*(\d+(?:\.\d+)?)", text)
    if signed:
        n = float(signed.group(2))
        mag = n / 10 if 1 < n <= 10 else n
        return clamp_weight(-mag if signed.group(1) == "-" else mag)

    plain = re.search(r"\b(\d+(?:\.\d+)?)\b", text)
    if plain:
        n = float(plain.group(1))
        if 1 < n <= 10:
            return clamp_weight(n / 10)
        if 0 <= n <= 1:
            return clamp_weight(n)

    for word, magnitude in WORD_MAGNITUDES.items():
        if word in text:
            return magnitude

    return None


def parse_weight_input(raw: str, expected_sign: int = 1) -> float | None:
    text = raw.strip().lower()
    if not text:
        return None

    mag = _parse_magnitude(text)
    if mag is None:
        return None

    if expected_sign < 0 and mag > 0 and not re.search(r"[+-]", text):
        return clamp_weight(-mag)
    return clamp_weight(mag)


def parse_batch_weight_answers(
    raw: str,
    pending: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not pending:
        return []

    updates: list[dict[str, Any]] = []
    seen: set[str] = set()

    numbered = list(re.finditer(r"(?:^|[\n,;])\s*(\d+)\s*[.:)]\s*([^\n,;]+)", raw))
    for match in numbered:
        idx = int(match.group(1)) - 1
        if idx < 0 or idx >= len(pending):
            continue
        weight = parse_weight_input(match.group(2), pending[idx].get("expectedSign", 1))
        if weight is None:
            continue
        edge_id = pending[idx]["edgeId"]
        if edge_id in seen:
            continue
        seen.add(edge_id)
        updates.append({"edge_id": edge_id, "weight": weight})
    if updates:
        return updates

    parts = [
        s.strip()
        for s in re.split(r"[,;\n]+", raw)
        if s.strip() and not re.match(r"^\d+\s*[.:)]", s.strip())
    ]
    if len(parts) > 1:
        for i, part in enumerate(parts[: len(pending)]):
            weight = parse_weight_input(part, pending[i].get("expectedSign", 1))
            if weight is None:
                continue
            updates.append({"edge_id": pending[i]["edgeId"], "weight": weight})
        if updates:
            return updates

    weight = parse_weight_input(raw, pending[0].get("expectedSign", 1))
    if weight is not None and len(pending) == 1:
        return [{"edge_id": pending[0]["edgeId"], "weight": weight}]

    return []


def format_weight(weight: float | None) -> str:
    if weight is None:
        return "unset"
    return f"{weight:+.2f}"


def format_weight_short(weight: float | None) -> str:
    if weight is None:
        return "?"
    return f"{weight:+.2f}"


def proportionality_label(weight: float | None) -> str:
    if weight is None:
        return "unset"
    if weight > 0:
        return "direct"
    if weight < 0:
        return "inverse"
    return "neutral"


def edge_color(weight: float | None) -> str:
    if weight is None:
        return "rgba(160,160,160,0.55)"
    if weight > 0:
        return f"rgba(74,222,128,{0.35 + abs(weight) * 0.55})"
    return f"rgba(248,113,113,{0.35 + abs(weight) * 0.55})"


def edge_width(weight: float | None) -> float:
    if weight is None:
        return 1.5
    return 1.5 + abs(weight) * 3.5
