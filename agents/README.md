# Mind agents (`agents/`)

Autonomous mind agents live here — one folder per agent, same layout as `cry/mindAgent/`.

```
agents/
  newsAgent/
    agent.py       # entrypoint + stream contract
    coindesk.py    # CoinDesk API client
    news_utils.py  # sentiment / keywords
  arbitrageAgent/
    agent.py       # Polymarket × Kalshi scanner
```

The backend loads agents dynamically via `backend/app/mind_agents/loader.py` and registers them in `backend/app/signal_registry.py`. Sub-agents (Whale Wallet, Divergence) stay under `backend/app/subagents/`.

## Run standalone (CLI)

From each agent folder:

```bash
cd agents/newsAgent
python agent.py --simulate
python agent.py --interval 30

cd agents/arbitrageAgent
python agent.py --simulate
python agent.py --interval 15
```

## Environment

| Variable | Agent | Purpose |
|----------|-------|---------|
| `COINDESK_API_KEY` | newsAgent | CoinDesk Data API key |
| `NEWS_POLL_INTERVAL_MS` | newsAgent | Poll interval (default 30000) |
| `ARB_POLL_INTERVAL_MS` | arbitrageAgent | Scan interval |

For canvas / marketplace streaming, set keys on the node or in `backend/.env`.
