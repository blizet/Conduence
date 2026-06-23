"""
Interactive terminal chat client.

Usage:
    python cli.py --user-id alice
    python cli.py --user-id alice --thread-id alice-mon-session
    python cli.py --user-id alice --provider openai
    python cli.py --user-id alice --provider gemini

If --thread-id is omitted, a new thread is created each run (fresh
short-term conversation) while still reading/writing to the SAME
underlying user graph -- so long-term memory persists across runs even
though each run starts a "new chat".

--provider overrides LLM_PROVIDER from .env for this run only. The matching
LLM_API_KEY (or legacy provider-specific key) must still be set in .env.
"""
from __future__ import annotations

import argparse

from chat_agent import run_turn
from config import SUPPORTED_PROVIDERS, load_settings
from zep_client import build_client, get_or_create_thread, get_or_create_user, new_thread_id


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Chat with the Zep-backed trading assistant.")
    parser.add_argument("--user-id", required=True, help="Stable Zep user id, e.g. 'alice'.")
    parser.add_argument(
        "--thread-id",
        default=None,
        help="Reuse a specific thread id instead of starting a fresh one.",
    )
    parser.add_argument(
        "--provider",
        choices=SUPPORTED_PROVIDERS,
        default=None,
        help="Override LLM_PROVIDER from .env for this run (anthropic | openai | gemini).",
    )
    parser.add_argument("--first-name", default=None)
    parser.add_argument("--last-name", default=None)
    parser.add_argument("--email", default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    settings = load_settings(provider_override=args.provider)

    zep = build_client(settings)

    get_or_create_user(
        zep,
        args.user_id,
        first_name=args.first_name,
        last_name=args.last_name,
        email=args.email,
    )

    thread_id = args.thread_id or new_thread_id(args.user_id)
    get_or_create_thread(zep, thread_id, args.user_id)

    print(f"Connected as user '{args.user_id}' on thread '{thread_id}'.")
    print(f"Using LLM provider: {settings.llm_provider} ({settings.model})")
    print("Type a message and press enter. Ctrl+C or 'exit' to quit.\n")

    conversation_history: list[dict[str, str]] = []

    while True:
        try:
            user_message = input("you> ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nbye.")
            break

        if not user_message:
            continue
        if user_message.lower() in {"exit", "quit"}:
            print("bye.")
            break

        result = run_turn(
            zep=zep,
            settings=settings,
            thread_id=thread_id,
            user_id=args.user_id,
            user_message=user_message,
            conversation_history=conversation_history,
        )

        print(f"\nassistant> {result.reply}\n")

        conversation_history.append({"role": "user", "content": user_message})
        conversation_history.append({"role": "assistant", "content": result.reply})


if __name__ == "__main__":
    main()
