"""
Push custom instructions to the Zep project.

Run this once after setup (or any time instructions.py changes):

    python setup_instructions.py

On the free plan the Zep API call is skipped automatically — the instructions
are still applied via the LLM system prompt on every chat turn.
On Enterprise / Flex+ plans they are also pushed natively to Zep's graph
extraction pipeline.
"""
from __future__ import annotations

from config import load_settings
from instructions import PROJECT_WIDE_INSTRUCTION, USER_INSTRUCTIONS, push_to_zep
from zep_cloud.client import Zep


def main() -> None:
    settings = load_settings()
    client = Zep(api_key=settings.zep_api_key)

    print("=== Custom Instructions ===\n")
    print("Project-wide instruction (trading_project_wide):")
    print(PROJECT_WIDE_INSTRUCTION.strip()[:300], "…\n")

    for uid, text in USER_INSTRUCTIONS.items():
        print(f"User-specific instruction for '{uid}':")
        print(text.strip()[:200], "…\n")

    print("Attempting to push to Zep API…")
    for uid in USER_INSTRUCTIONS:
        results = push_to_zep(client, user_id=uid)
        for scope, status in results.items():
            print(f"  {scope}: {status}")

    print(
        "\nNote: Instructions are always embedded in the LLM system prompt "
        "regardless of plan.\nEnterprise / Flex+ plans additionally apply them "
        "inside Zep's graph extraction pipeline."
    )


if __name__ == "__main__":
    main()
