# kalshiSports — Late-Game Kalshi Soccer Scanner

A LangGraph-orchestrated paper-trading scanner for the **late-game favorite
strategy** on Kalshi soccer markets: buy near-certain winners at 92–97c and
collect the last few cents, with a hard stop-out to cap disaster losses.

Follows the same architecture as `backend/app`: async tools, sub-agents as
async signal streams, and a compiled `StateGraph` orchestrator.

```
subagents/sportsScanner  (async stream — Kalshi book + live game state per tick)
        │ market_tick signals
        ▼
┌────────────────────────────────────────────┐
│        LangGraph orchestrator              │
│  ingest_tick                               │
│    ├─ manage_position ─► publish ─► END    │   (held markets: stop / settle)
│    ├─ evaluate_entry                       │
│    │    ├─ enter_position ─► publish ─► END│   (all gates pass)
│    │    └─ context_only ──────────► END    │   (any gate fails)
│    └─ context_only ───────────────► END    │
└────────────────────────────────────────────┘
        │ paper trade events
        ▼
stdout  +  out/trades.jsonl
```

## The strategy

The market price is the **trigger**, not the edge. Buying at 92c means the
breakeven win rate is ~92.3% after fees — one full loss wipes ~12 wins.
The edge has to come from the game-state filters selecting spots where the
true win probability is higher than the price. The paper-trade log is what
proves (or disproves) that.

### Entry — ALL gates must pass (`orchestrator/decision_engine.py`)

| Gate | Default |
|------|---------|
| Price band | YES ask in **[92c, 97c]** (above 97c nothing is left after fees) |
| Clock | in-play, minute >= **80** |
| Lead | our team **+2 goals**, or **+1 after 87'** |
| Cards | no man disadvantage for our team |
| VAR | no VAR event in the last ~3 minutes |
| Spread | <= **2c** |
| Depth | book depth at ask covers the full intended size |
| Exposure | < **5** open positions, max 1 per match |

### Sizing

`risk_pct` (2%) of `portfolio_usd` per trade, sized so a full loss of the
premium equals the risk budget. Kalshi taker fee `0.07·P·(1−P)` per contract
is charged on entry and on any stop-out exit (~0.3c/contract at 95c).

### Exit

- **Settlement** — YES pays $1 (win) or $0 (loss)
- **Stop-out** — if the YES bid drops below **75c** (goal conceded, red card),
  sell at the bid: lose ~17–20c instead of the full ~92c

## Quick start

```bash
cd kalshiSports
pip install -r requirements.txt

# offline demo — scripted matches: one win, one stop-out, one rejection
python main.py --simulate

# live paper trading (Kalshi market data is public, no key needed)
export API_FOOTBALL_KEY=...        # free key from api-football.com
python main.py

# results so far
python report.py
```

Every trade event is printed and appended to `out/trades.jsonl`. Run paper
mode for 2–4 weeks, then check `report.py`: the strategy only has an edge if
the **realized win rate beats the average entry price + fees**.

## Live-mode wiring

- **Kalshi** (`tools/kalshi.py`) — public `GET /markets` + `GET /markets/{t}/orderbook`
  on `api.elections.kalshi.com/trade-api/v2`. Set `kalshi_series_tickers` in
  `config.json` to the soccer series you want scanned (e.g. EPL game series);
  empty list scans the general open-markets feed.
- **API-Football** (`tools/api_football.py`) — `GET /fixtures?live=…` for minute,
  score, red cards, and VAR events. `api_football_league_ids` in `config.json`
  defaults to EPL, La Liga, Serie A, Bundesliga, Ligue 1, UCL, UEL.
- Markets are matched to fixtures by team-name tokens (`lib/match.py`).

## Folder layout

```
kalshiSports/
├── main.py                          entrypoint (CLI)
├── report.py                        win-rate vs price report from the log
├── config.json                      strategy thresholds + sizing
├── requirements.txt
├── app/
│   ├── tools/
│   │   ├── kalshi.py                markets + orderbook (public API)
│   │   └── api_football.py          live fixtures (minute, score, reds, VAR)
│   ├── subagents/
│   │   └── scanner_subagent.py      async stream of market_tick signals
│   ├── lib/
│   │   ├── fees.py                  Kalshi taker/maker fee math
│   │   └── match.py                 Kalshi market ↔ fixture team matching
│   └── orchestrator/
│       ├── state.py                 ScannerState TypedDict
│       ├── nodes.py                 LangGraph node functions
│       ├── graph.py                 StateGraph wiring + compile
│       ├── decision_engine.py       entry gates + stop/settle logic (pure)
│       ├── tools_registry.py        tool handler registry
│       └── runner.py                tick loop, carries positions between runs
└── out/trades.jsonl                 append-only paper-trade log
```

## Important caveats

- **Paper mode only** — there is no order execution; entries/exits are logged,
  never sent. Live trading needs Kalshi auth, order endpoints, and US
  eligibility/KYC.
- In-play markets are a latency game; a "cheap" ask right after a dangerous
  attack usually means you're the slow one. The VAR/clock gates reduce but do
  not eliminate this.
- 3-way soccer markets (draw) are handled implicitly: the contract is "team X
  wins", so a draw settles NO — the late 1-goal rule is the risky one.
