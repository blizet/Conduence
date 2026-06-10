"""Divergence detector tool.

Compares actual 24h co-movement of two assets against the expected
correlation from the graph. Big gaps mean one of two things:

- a mispricing you can trade (correlation will likely revert), or
- an idiosyncratic driver (e.g. Zcash pumping on privacy news while
  Bitcoin is flat) — in which case correlation-based inference for
  that asset should be IGNORED for now.

The tool reports both, and the decision engine treats diverging
assets with extra caution (fewer assumptions, not more).
"""

from __future__ import annotations

from .base import Tool

DIVERGENCE_THRESHOLD = 3.0  # percentage points of unexplained move


class DivergenceTool(Tool):
    name = "divergence"
    description = "Flag assets moving against their graph-expected correlation"

    def call(
        self,
        base_change: float,
        other_change: float,
        expected_corr: float,
        base_id: str = "base",
        other_id: str = "other",
        **_,
    ) -> dict:
        """All changes in 24h percent. expected_corr in [-1, 1]."""
        expected_other = base_change * expected_corr
        gap = other_change - expected_other
        diverging = abs(gap) >= DIVERGENCE_THRESHOLD

        direction = "above" if gap > 0 else "below"
        note = (
            f"{other_id} moved {other_change:+.1f}% vs expected {expected_other:+.1f}% "
            f"(corr {expected_corr:+.2f} with {base_id} which moved {base_change:+.1f}%) — "
            f"{abs(gap):.1f}pp {direction} expectation"
        )
        return {
            "diverging": diverging,
            "gap_pp": round(gap, 2),
            "expected_change": round(expected_other, 2),
            "actual_change": round(other_change, 2),
            "note": note,
        }
