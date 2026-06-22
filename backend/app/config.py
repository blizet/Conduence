import os
from pathlib import Path

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parents[2]
for _candidate in (_REPO_ROOT / "backend" / ".env", _REPO_ROOT / ".env"):
    if _candidate.exists():
        load_dotenv(_candidate, override=False)

PORT = int(os.getenv("PORT", "4000"))
COINDESK_API_KEY = os.getenv("COINDESK_API_KEY", "").strip()
COINMARKETCAP_API_KEY = os.getenv("COINMARKETCAP_API_KEY", "").strip()
CRYPTO_NEWS_API_KEY = os.getenv("CRYPTO_NEWS_API_KEY", "").strip()
CRYPTOQUANT_API_KEY = os.getenv("CRYPTOQUANT_API_KEY", "").strip()
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "").strip()
DEFILLAMA_API_KEY = os.getenv("DEFILLAMA_API_KEY", "").strip()
COINGECKO_API_KEY = os.getenv("COINGECKO_API_KEY", "").strip()
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
X_BEARER_TOKEN = os.getenv("X_BEARER_TOKEN", os.getenv("TWITTER_BEARER_TOKEN", "")).strip()
TOOL_FETCH_TIMEOUT_MS = int(os.getenv("TOOL_FETCH_TIMEOUT_MS", "15000"))
AGENT_FETCH_TIMEOUT_MS = int(os.getenv("AGENT_FETCH_TIMEOUT_MS", "15000"))
