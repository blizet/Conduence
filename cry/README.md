# cry — Polymarket Multi-Agent Trade Suggester

An orchestrator-level multi-agent system that emits **suggested trades for Polymarket**.
It is built from exactly the three drag-and-drop building blocks of the canvas UI,
plus one shared source of truth: the **correlation graph**.

```
mindAgent/cryptoNewsAgent ┐
mindAgent/arbitrageAgent  ┤        (standalone processes — NDJSON on stdout)
        │  news + arbitrage events
        ▼
┌───────────────────────────────┐
│         Orchestrator          │ ◄── subAgents/whaleAgent       (polls Polymarket wallets)
│   graph/ + decision engine    │ ◄── subAgents/divergenceAgent  (checks graph vs real prices)
└───────────────────────────────┘
        │  trade suggestions
        ▼
stdout  +  cry/out/suggestions.jsonl
```

Latency budget per stage: see [LATENCY.md](LATENCY.md).

## Quick start

No dependencies — Python 3.10+ standard library only.

```bash
cd cry

# fully offline demo (synthetic news, whale trades, prices)
python3 main.py --simulate --duration 60

# stop after the first 3 suggestions
python3 main.py --simulate --max 3

# live mode (Polymarket Gamma/Data APIs + CoinGecko are public, no key;
# real news requires COINDESK_API_KEY, otherwise run the mind agent with --simulate)
export COINDESK_API_KEY=...
python3 main.py
```

Every suggestion is printed and appended to `out/suggestions.jsonl`.

## The three building blocks

### 1. Mind agent — `mindAgent/cryptoNewsAgent/`

A **fully standalone, independently deployable** agent. Hard rule: it imports
nothing outside its own folder (stdlib only). It polls CoinDesk (or replays
sample headlines in `--simulate`), classifies sentiment, extracts keywords,
and emits one JSON object per line on stdout:

```json
{"type": "news", "agent": "cryptoNewsAgent", "headline": "...", "sentiment": "bullish",
 "keywords": ["bitcoin", "etf"], "thesis": "...", "url": "...", "ts": "..."}
```

Anything can subscribe — the cry orchestrator spawns it as a subprocess and reads
stdout, but the same binary could feed Kafka, a webhook, or run on its own box:

```bash
python3 mindAgent/cryptoNewsAgent/agent.py --simulate --interval 10
```

To add a new mind agent (e.g. an X/Twitter agent), create a new self-contained
folder under `mindAgent/` that emits the same NDJSON contract, and list it in
`config.json -> mind_agents`.

### 1b. Mind agent — `mindAgent/arbitrageAgent/`

Same standalone rules. Scans **Polymarket x Kalshi** for cross-platform
arbitrage and emits an event only when ALL gates pass:

1. **Open markets only** — Polymarket `active=true, closed=false, acceptingOrders`,
   end date in the future; Kalshi `status=open`, close time in the future.
   Closed/settled markets are structurally excluded.
2. **Same event** — normalized title match (synonyms, `july==jul`, `btc==bitcoin`),
   numeric thresholds must match exactly ($120,000 ≠ $115,000 → hard reject),
   close dates within 4 days. A match confidence is attached; pairs below 0.6 are dropped.
3. **Executable prices** — both legs priced at the **ask** (what crossing the
   spread actually costs), never mid/last.
4. **Real fees** — Kalshi taker `0.07·P·(1−P)` per contract (max ~1.75c at P=0.5);
   Polymarket crypto-category taker `0.072·P·(1−P)` (~1.8% peak, Mar-2026 schedule).
   Computed at each leg's actual price.
5. **Net edge ≥ 1.5c/contract** after all fees; both directions checked
   (YES-Poly + NO-Kalshi, and NO-Poly + YES-Kalshi).
6. **Liquidity** — ≥ $2K per leg; executable size capped by the thinner leg.

Both venue fetches run **in parallel** (one scan ≈ 0.4–1.2s live). Every event
ships caveats: resolution-criteria risk, top-of-book slippage, capital lockup.
Arbitrage events **bypass the decision engine** — an arb is market-neutral and
self-verifying, so the orchestrator publishes it directly for speed.

```bash
python3 mindAgent/arbitrageAgent/agent.py --simulate --interval 5
```

### 2. Sub-agents — `subAgents/`

Polling workers owned by the orchestrator. Each one extends `SubAgent`
(`subAgents/base.py`), gets a set of **tools plugged in**, runs on its own
thread, and pushes signals onto the orchestrator's bus:

```json
{"type": "whale", "agent": "whaleAgent", "keywords": ["bitcoin"], "direction": "bearish",
 "strength": 0.4, "summary": "0x12ab… BUY No @0.73 ($16,333) on \"Will Bitcoin hit $120k…\"",
 "data": {"...": "raw evidence"}, "ts": "..."}
```

Included sub-agents:

| Agent | What it does | Tools it plugs in |
|-------|-------------|-------------------|
| `whaleAgent` | Tracks the 2–3 wallet addresses from `config.json` via the Polymarket Data API; emits a signal whenever a tracked wallet opens a new trade (BUY Yes / SELL No → bullish, size → strength) | `polymarket_wallet` |
| `divergenceAgent` | Compares actual 24h co-movement of asset pairs against the graph's expected correlation; flags decoupling (e.g. Zcash up 18% while Bitcoin is flat despite a 0.35 edge) | `coingecko_price`, `divergence` |

New sub-agent = subclass `SubAgent`, implement `poll()`, register it in
`orchestrator/orchestrator.py::_build_sub_agents`.

### 3. Tools — `tools/`

Small stateless capabilities a user can snap onto any sub-agent. Each tool is one
class with a single `call(**kwargs) -> dict` entrypoint and a `simulate=True`
offline mode, registered in a `ToolRegistry`:

| Tool | API | Purpose |
|------|-----|---------|
| `coingecko_price` | CoinGecko (free) | Spot price + 24h change per asset |
| `polymarket_gamma` | Polymarket Gamma | Search open markets by keyword, sorted by 24h volume |
| `polymarket_wallet` | Polymarket Data API | Recent trades / open positions of a wallet |
| `divergence` | local computation | Expected-vs-actual co-movement, flags decoupled assets |

New tool = subclass `Tool` in `tools/`, add it to `tools/__init__.py::default_registry`.

## The correlation graph — `graph/correlation_graph.json`

**The graph is the main source of truth** for how real-world things relate.
It is plain JSON and fully user-editable — change a weight, add a node, and the
whole system reasons differently. No code changes needed.

- **Nodes**: `asset` (tradeable: bitcoin, ethereum, zcash…), `theme`
  (altcoins, memecoins, privacy_coins…), `event` (trump_crypto_policy,
  fed_rates, etf_flows, sec_regulation…). Each node carries `keywords`
  used to map news headlines / market questions onto the graph.
- **Edges**: `weight` ∈ [-1, 1] — signed correlation. Negative = inverse
  (e.g. `btc_dominance ↔ altcoins` is −0.7). `direction: "uni"` means the
  source drives the target only (events drive assets, not vice versa).
  Every edge has a `rationale` so suggestions can explain themselves.

Examples already encoded: `bitcoin ↔ ethereum 0.85`, `trump_crypto_policy → altcoins 0.85`,
`zcash ↔ bitcoin` only **0.35** (privacy coins decouple — exactly the Zcash case),
`privacy_crackdown → zcash −0.75`.

`graph/graph.py` answers two questions:

1. `match_keywords(text)` — which nodes does this signal touch?
2. `propagate(node, strength)` — if this node moves, what else moves and how much?
   Signed weights multiply along paths with a per-hop decay of 0.6, so second-order
   effects are always weaker (`trump → altcoins → solana = 0.85 × 0.8 × 0.6 ≈ +0.41`).

Inspect the propagation directly:

```bash
python3 graph/graph.py
```

## How a trade gets decided (low-assumption policy)

Both diagram flows are one code path — the **rolling signal memory** makes
whichever agent fired first the context that the second one confirms against:

- **Flow-1**: whale emits trade → keywords → graph → related markets, recent *news* as corroboration
- **Flow-2**: news emits article → keywords → graph → related markets, recent *whale trades* as corroboration

For each impacted graph node, `orchestrator/decision.py` scores:

```
confidence = 0.40 · |graph impact|        how strongly the graph links event → asset
           + 0.20 · signal strength       how loud the originating signal is
           + 0.25 · corroboration         a DIFFERENT agent type pointing the same way (last 30 min)
           + 0.15 · price confirmation    CoinGecko 24h move agrees with the predicted direction
           − 0.30 · divergence caution    asset currently decoupled from the graph
           (contradicting signals and disagreeing prices subtract)
```

A suggestion is emitted **only if** confidence ≥ `min_confidence` (0.55) **and**
at least one independent confirmation exists. A lone headline is never a trade.
Divergence signals are context, not triggers: when `divergenceAgent` says an asset is
off-script (the Zcash case), graph inference through that asset gets *less* trusted.

### Market selection (strategy sect. 3 + 7)

Related markets are not picked by raw volume — every candidate passes hard gates
and is ranked by a composite **quality score**:

| Check | Gate | Scoring |
|-------|------|---------|
| 24h volume | ≥ $10K (red flag below) | sweet spot $50K–$500K = 1.0; hyper-liquid slightly penalized (efficient pricing = less edge) |
| Liquidity | ≥ $10K | saturates at $50K |
| Bid-ask spread | ≤ 5% (avoid illiquid) | ≤ 2% ideal, linear to 0 at 5% |

`quality = 0.40·volume + 0.35·spread + 0.25·liquidity`. Markets under quality 0.30
are rejected outright; marginal quality shaves final confidence (thin book = worse
fills and exits). Entry is the **executable price** (ask for YES, 1−bid for NO),
and entries outside [0.05, 0.92] are rejected — no payoff left near 1.0, junk tail near 0.

### Position sizing + hedging (strategy sect. 11)

- **Size**: 2% of `portfolio_usd` at threshold confidence, scaling to 5% at full
  conviction — then capped at 5% of the market's liquidity to bound slippage.
- **Hedge**: for assets with a graph neighbor at |corr| ≥ 0.7, the suggestion
  includes a correlated hedge at 50% of the main size — opposite side for positive
  correlation (long BTC → short ETH market), same side for negative.

Every suggestion ships its full evidence trail: originating signal, graph path with
edge rationale, corroborations/contradictions, price check, market-quality scorecard,
and the hedge leg.

## Configuration — `config.json`

```json
{
  "whale_wallets": ["0x…", "0x…"],   // 2-3 Polymarket proxy wallets to track
  "whale_poll_s": 30,
  "divergence_poll_s": 60,
  "news_poll_s": 60,
  "arbitrage_poll_s": 15,
  "mind_agents": ["cryptoNewsAgent", "arbitrageAgent"],
  "min_confidence": 0.55,            // raise for fewer, higher-conviction suggestions
  "portfolio_usd": 10000             // basis for 2-5% position sizing
}
```

## Folder layout

```
cry/
├── main.py                          entrypoint (CLI)
├── config.json                      wallets, intervals, confidence threshold
├── graph/
│   ├── correlation_graph.json       USER-EDITABLE source of truth
│   └── graph.py                     keyword matching + signed propagation
├── mindAgent/
│   ├── cryptoNewsAgent/agent.py     standalone news emitter (stdlib only, NDJSON stdout)
│   └── arbitrageAgent/agent.py      standalone Polymarket x Kalshi arb scanner
├── subAgents/
│   ├── base.py                      SubAgent block (threaded poller + tool slots)
│   ├── whale_agent.py               wallet tracker (Polymarket Data API)
│   └── divergence_agent.py          correlation-health watcher
├── tools/
│   ├── base.py                      Tool block + ToolRegistry
│   ├── coingecko.py                 price feed
│   ├── polymarket_gamma.py          market discovery
│   ├── polymarket_data.py           wallet trades/positions
│   └── divergence.py                expected-vs-actual co-movement
├── orchestrator/
│   ├── orchestrator.py              signal bus, mind-agent subprocess, sub-agent threads
│   └── decision.py                  confidence scoring + suggestion gating
├── LATENCY.md                       realistic latency per stage + how to go lower
└── out/suggestions.jsonl            append-only suggestion log
```

## Mapping to the drag-and-drop UI

| Canvas block | Code | Connection contract |
|--------------|------|---------------------|
| Mind agent | a folder under `mindAgent/` | NDJSON events on stdout |
| SubAgent | a `SubAgent` subclass | `signal(...)` dicts onto the orchestrator bus |
| Tool | a `Tool` subclass | `call(**kwargs) -> dict`, snaps into any sub-agent |
| Edge between blocks | orchestrator wiring | tool registry injection / bus subscription |
| Graph editor | `graph/correlation_graph.json` | plain JSON, hot-swappable per user |

Each block is independently testable offline (`simulate=True` everywhere), so the UI can
let users dry-run a canvas before going live.
