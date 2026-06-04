from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from cot_kb.normalize import normalize_batch, normalize_decision


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def split_batch_file(batch_path: Path, out_dir: Path) -> list[Path]:
    raw = load_json(batch_path)
    if not isinstance(raw, list):
        raise ValueError(f"Expected JSON array in {batch_path}")

    written: list[Path] = []
    for item in normalize_batch(raw):
        decision_id = item["decision_id"]
        out = out_dir / f"{decision_id}.json"
        save_json(out, item)
        written.append(out)
    return written
