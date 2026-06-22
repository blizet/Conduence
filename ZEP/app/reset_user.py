"""
Deletes a Zep user (and therefore their whole graph) and optionally
recreates them fresh. Useful in development when you want to wipe a
test user's accumulated graph and start over.

Usage:
    python scripts/reset_user.py --user-id alice
    python scripts/reset_user.py --user-id alice --no-recreate
"""
from __future__ import annotations

import argparse

from zep_cloud.core.api_error import ApiError

from config import load_settings
from zep_client import build_client, get_or_create_user


def main() -> None:
    parser = argparse.ArgumentParser(description="Delete (and optionally recreate) a Zep user.")
    parser.add_argument("--user-id", required=True)
    parser.add_argument(
        "--no-recreate",
        action="store_true",
        help="Don't recreate the user after deleting -- just delete.",
    )
    args = parser.parse_args()

    settings = load_settings()
    client = build_client(settings)

    confirm = input(
        f"This will permanently delete all graph data for user '{args.user_id}'. "
        f"Type the user id to confirm: "
    )
    if confirm != args.user_id:
        print("Confirmation did not match, aborting.")
        return

    try:
        client.user.delete(user_id=args.user_id)
        print(f"Deleted user '{args.user_id}'.")
    except ApiError as exc:
        if exc.status_code == 404:
            print(f"User '{args.user_id}' did not exist.")
        else:
            raise

    if not args.no_recreate:
        get_or_create_user(client, args.user_id)
        print(f"Recreated empty user '{args.user_id}'.")


if __name__ == "__main__":
    main()
