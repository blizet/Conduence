from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


@dataclass
class SearchHit:
    path: Path
    line: int
    snippet: str
    score: float


def _tokenize(text: str) -> set[str]:
    return {t.lower() for t in re.findall(r"[a-zA-Z0-9_#]+", text) if len(t) > 2}


def search_markdown(
    root: Path,
    query: str,
    *,
    limit: int = 20,
) -> list[SearchHit]:
    """Lightweight BM25-style search over markdown files (for LLM CLI handoff)."""
    query_tokens = _tokenize(query)
    if not query_tokens:
        return []

    hits: list[SearchHit] = []
    for path in root.rglob("*.md"):
        if path.name.startswith("."):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        doc_tokens = _tokenize(text)
        overlap = len(query_tokens & doc_tokens)
        if overlap == 0:
            continue
        score = overlap / len(query_tokens)
        for idx, line in enumerate(text.splitlines(), start=1):
            line_tokens = _tokenize(line)
            line_overlap = len(query_tokens & line_tokens)
            if line_overlap:
                hits.append(
                    SearchHit(
                        path=path,
                        line=idx,
                        snippet=line.strip()[:200],
                        score=score + line_overlap * 0.1,
                    )
                )
        if not any(h.path == path for h in hits):
            hits.append(
                SearchHit(path=path, line=1, snippet=text[:200].replace("\n", " "), score=score)
            )

    hits.sort(key=lambda h: h.score, reverse=True)
    return hits[:limit]
