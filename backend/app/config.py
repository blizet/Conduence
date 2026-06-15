import json
import os
from pathlib import Path

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parents[2]
for _candidate in (_REPO_ROOT / "backend" / ".env", _REPO_ROOT / ".env"):
    if _candidate.exists():
        load_dotenv(_candidate, override=False)

PORT = int(os.getenv("PORT", "4000"))
FALKORDB_HOST = os.getenv("FALKORDB_HOST", "localhost")
FALKORDB_PORT = int(os.getenv("FALKORDB_PORT", "6380"))
KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "localhost:19092").split(",")
COT_KAFKA_FROM_BEGINNING = os.getenv("COT_KAFKA_FROM_BEGINNING", "1") != "0"
COINDESK_API_KEY = os.getenv("COINDESK_API_KEY", "").strip()
COINMARKETCAP_API_KEY = os.getenv("COINMARKETCAP_API_KEY", "").strip()
CRYPTO_NEWS_API_KEY = os.getenv("CRYPTO_NEWS_API_KEY", "").strip()
CRYPTOQUANT_API_KEY = os.getenv("CRYPTOQUANT_API_KEY", "").strip()
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "").strip()
DEFILLAMA_API_KEY = os.getenv("DEFILLAMA_API_KEY", "").strip()
COINGECKO_API_KEY = os.getenv("COINGECKO_API_KEY", "").strip()
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TOOL_FETCH_TIMEOUT_MS = int(os.getenv("TOOL_FETCH_TIMEOUT_MS", "15000"))
AGENT_FETCH_TIMEOUT_MS = int(os.getenv("AGENT_FETCH_TIMEOUT_MS", "15000"))


def _load_publisher_keys() -> dict[str, str]:
    """agent_id → API key for external wrapper publishers."""
    raw = os.getenv("COT_PUBLISHER_KEYS", "").strip()
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return {str(k): str(v) for k, v in parsed.items()}
        except json.JSONDecodeError:
            pass
        pairs: dict[str, str] = {}
        for part in raw.split(","):
            piece = part.strip()
            if ":" in piece:
                agent_id, key = piece.split(":", 1)
                pairs[agent_id.strip()] = key.strip()
        if pairs:
            return pairs

    fallback = os.getenv("COT_WRAPPER_API_KEY", "cot-dev-wrapper-key").strip()
    return {"sportsScanner.user_demo": fallback}


PUBLISHER_KEYS = _load_publisher_keys()
