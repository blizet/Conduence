# Full platform run guide

End-to-end instructions for running the CoT_kb playground: infrastructure, autonomous agents (kalshiSports + newsAgent), marketplace, orchestrator workflows, CoT graph, and publishing workflows.

## Architecture overview

Three roles in a typical demo:

```text
Publisher (your machine)          Platform (docker + backend + frontend)       Subscriber (playground)
─────────────────────────         ──────────────────────────────────────       ─────────────────────
kalshiSports + HTTP wrapper  ──►  Backend :4000  ──►  Kafka / FalkorDB         Install feed + build canvas
                                  Playground :3001 ◄── WebSocket feeds          LLM → CoT Builder → Graph
```

| Role | What you run | What others see |
|------|----------------|-----------------|
| **Publisher** | `kalshiSports` + wrapper | Feed listed in marketplace |
| **Subscriber** | Playground workflow | Live signals + LLM decisions |
| **Graph viewer** | CoT Graph tab / FalkorDB | Decision chain in FalkorDB |

### Agent types in the marketplace

| Type | Badge | Who runs 24/7 | Marketplace controls |
|------|-------|---------------|----------------------|
| **Hosted** (newsAgent, arbitrageAgent) | Hosted | Your backend | Start / Stop live feed |
| **External** (kalshiSports) | External | Publisher's machine | Live / Offline status only |
| **Published workflow** | Workflow | Manual Run Workflow (today) | Load onto canvas |

---

## Part 0 — One-time setup

### 1. Install dependencies

```powershell
cd C:\Users\Anjali\Downloads\CoT_kb

npm install
npm run install:backend

cd kalshiSports
pip install -r requirements.txt
cd ..
```

### 2. Start infrastructure

```powershell
docker compose up -d
```

Wait ~1 minute for containers to become healthy.

| Service | URL | Purpose |
|---------|-----|---------|
| **Playground** | http://localhost:3001 | Workflow canvas + marketplace |
| **Backend API** | http://localhost:4000 | Orchestrator, feeds, CoT ingest |
| **FalkorDB Browser** | http://localhost:3000 | Raw graph GUI (`redis://falkordb-server:6379`) |
| **Redpanda Console** | http://localhost:8080 | Kafka topics and messages |
| **Neo4j Browser** | http://localhost:7474 | Optional legacy graph (`neo4j` / `cot-kb-password`) |
| **RedisInsight** | http://localhost:8001 | Redis visualization |

### 3. Environment files

**Backend** — copy and edit:

```powershell
copy backend\.env.example backend\.env
```

Minimum for this guide:

```env
PORT=4000
KAFKA_BROKERS=localhost:19092
FALKORDB_HOST=localhost
FALKORDB_PORT=6380

# LLM orchestrator
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash-lite

# CoT graph namespace (CoT Graph tab + CoT Builder default)
MAIN_GRAPH_ID=user_771.main.v1
MAIN_USER_NODE_ID=user_771

# External wrapper auth (must match kalshiSports)
COT_WRAPPER_API_KEY=cot-dev-wrapper-key

# Optional — hosted News Agent
COINDESK_API_KEY=your_coindesk_key
```

**Frontend:**

```powershell
copy frontend\.env.example frontend\.env.local
```

**kalshiSports wrapper:**

```powershell
cd kalshiSports
copy .env.example .env
```

Edit `kalshiSports/.env`:

```env
COT_WRAPPER_ENABLED=1
COT_API_URL=http://localhost:4000
COT_AGENT_ID=sportsScanner.user_demo
COT_PUBLISHER_KEY=cot-dev-wrapper-key
```

For live Kalshi mode (not `--simulate`), also set `API_FOOTBALL_KEY` from [api-football.com](https://www.api-football.com/).

---

## Part 1 — Start the platform

Use **three terminals** for the full demo.

**Terminal A — backend**

```powershell
cd C:\Users\Anjali\Downloads\CoT_kb
npm run dev:backend
```

Verify: http://localhost:4000/api/health → `"ok": true`, Kafka and FalkorDB available.

**Terminal B — frontend**

```powershell
cd C:\Users\Anjali\Downloads\CoT_kb
npm run dev:frontend
```

Open **http://localhost:3001**.

**Terminal C — kalshiSports publisher** (see Part 2)

---

## Part 2 — Run kalshiSports autonomously (external publisher)

kalshiSports is an **external** mind agent: you run the process; the platform only ingests HTTP signals.

```powershell
cd C:\Users\Anjali\Downloads\CoT_kb\kalshiSports

# Offline demo (recommended first): win + stop-out + rejection
python main.py --simulate

# Or stop after N trade events
python main.py --simulate --max-trades 3

# Live paper mode (needs API_FOOTBALL_KEY)
python main.py
```

Expected output:

- `[runner] CoT wrapper enabled — emitting to platform feed`
- Tick logs on stderr
- Paper trade banners on ENTER / STOP_OUT / SETTLE

The wrapper (`kalshiSports/cot_wrapper.py`) POSTs to:

```http
POST http://localhost:4000/api/feeds/sportsScanner.user_demo/signal
Authorization: Bearer cot-dev-wrapper-key
Content-Type: application/json

{ "payload": { "type": "market_tick", "thesis": "...", "ts": "..." } }
```

**Verify ingest (optional):**

```powershell
curl -X POST http://localhost:4000/api/feeds/sportsScanner.user_demo/signal `
  -H "Authorization: Bearer cot-dev-wrapper-key" `
  -H "Content-Type: application/json" `
  -d "{\"payload\":{\"type\":\"market_tick\",\"thesis\":\"test\",\"ts\":\"2026-06-12T00:00:00Z\"}}"
```

**Verify in Redpanda Console** (http://localhost:8080):

- Topic: `agent.feeds.sportsScanner.user_demo.public`

Keep `python main.py` running — that is the publisher's 24/7 process (use tmux, a VPS, or Task Scheduler for production).

---

## Part 3 — Marketplace: install mind agents

In the playground (http://localhost:3001):

1. Click **Marketplace** (header).
2. Click the **(i)** icon for the **Wrapper Guide** (HTTP integration steps for any language).
3. Find **Kalshi Sports Scanner** — badges: `External`, `Live` / `Offline`.
4. Click **Install**.

| Agent | Type | Subscriber action | Publisher action |
|-------|------|-------------------|------------------|
| Kalshi Sports Scanner | External | Install only | Run `python main.py` with wrapper |
| News Agent | Hosted | Install + **Start live feed** | Set `COINDESK_API_KEY`, backend runs poll loop |
| Arbitrage Agent | Hosted | Install + **Start live feed** | Backend runs scanner |

External agents show **Live · receiving publisher feed** when the publisher process is active (signal within ~45s).

---

## Part 4 — Build an orchestrator workflow

### Recommended canvas (kalshiSports subscriber)

Drag from the palette onto the canvas:

| Node | Role |
|------|------|
| **Kalshi Sports Scanner** | External feed (after marketplace install) |
| **LLM Analyzer** | LangGraph orchestrator / reasoning |
| **CoT Builder** | Decision → graph JSON |
| **Output** | Display result (optional) |

Wire connections:

```text
Kalshi Sports Scanner (out) ──► LLM Analyzer (in-0)
LLM Analyzer (out-0)         ──► CoT Builder (in)
CoT Builder (out)            ──► Output (in)   [optional]
```

### Configure LLM Analyzer

- **Provider / API key**: Gemini (or key from `backend/.env`)
- **Context graph**: `Decision`
- **Graph ID**: `user_771.main.v1`

### Configure CoT Builder

- **Graph ID**: `user_771.main.v1`
- **User node ID**: `user_771`
- Enable **Auto emit to Redpanda** to write decisions into FalkorDB automatically

### Alternative: hosted News Agent workflow

Same wiring with **News Agent** instead of Kalshi Sports:

```text
News Agent ──► LLM Analyzer ──► CoT Builder ──► Output
```

1. Marketplace → Install News Agent → **Start live feed**
2. Set CoinDesk API key on the node or in `backend/.env`

---

## Part 5 — Run the orchestrator

1. Ensure the feed is live (kalshiSports running, or News Agent started).
2. Click **Run Workflow** in the playground header.

What happens:

1. **Phase A** — runnable tool nodes execute (preview on Output nodes).
2. **Phase B** — `POST /api/orchestrator/run` with your canvas:
   - Picks the latest signal from installed feeds (sports scanner, news, arb, whale, divergence)
   - Runs LangGraph: tools → LLM synthesis → optional CoT draft
3. Results appear on **LLM Analyzer** (`decisionJson`) and **CoT Builder**.

If the orchestrator falls back to demo Bitcoin news, no live feed has arrived yet — wait for a tick and run again.

---

## Part 6 — View the CoT graph

### A. In-playground (easiest)

1. Click **CoT Graph** in the header (node icon).
2. Set **Graph ID** to `user_771.main.v1` and press Enter.
3. Click nodes to inspect `user → protocol → market → trade` chains.

If empty: emit a CoT first (non-HOLD decision + CoT Builder auto-emit or manual Build & emit).

### B. FalkorDB Browser

- http://localhost:3000
- Connect: `redis://falkordb-server:6379`
- Graph name derived from `user_771.main.v1`

### C. Redpanda Console

- http://localhost:8080
- `market.signals.public` — `cot.delta` events after CoT emit
- `agent.feeds.*.public` — raw agent signals

---

## Part 7 — Publish a workflow to the marketplace

You can publish a canvas you built (similar in spirit to listing a mind agent strategy).

1. Build your workflow on the canvas (at least one node).
2. Click **Publish** in the playground header.
3. Fill in **Name**, **Description**, **Publisher** (optional).
4. API keys on nodes are stripped automatically before save.
5. Open **Marketplace** — published entries appear with a **Workflow** badge.
6. Others click **Load onto canvas** to import your template.

Storage: `data/workflows/marketplace.json` on the backend.

**Note:** Published workflows are **templates** today — subscribers load them and run manually with **Run Workflow**. They do not auto-run 24/7 like hosted newsAgent until orchestrator stream auto-start is wired in the UI.

---

## Part 8 — Making a strategy like newsAgent (hosted vs external)

### External wrapper (kalshiSports pattern)

Best when the agent runs outside your platform (any language).

1. Emit signals via `POST /api/feeds/{agent_id}/signal` with a publisher API key.
2. Register listing in `backend/app/external_agents/registry.py`.
3. Subscribers install from marketplace — no Start/Stop on your side.

See `kalshiSports/cot_wrapper.py` (~40 lines, HTTP only).

### Hosted like newsAgent

Best when the platform should run the agent 24/7.

1. Implement `agents/yourAgent/agent.py` with `streamSignals()` async generator.
2. Register in `backend/app/signal_registry.py` (`AUTONOMOUS_AGENT_REGISTRY` + `MARKETPLACE_CATALOG`).
3. Add a frontend node (copy `NewsAgentNode.tsx`).
4. Subscribers **Install + Start live feed**.

Reference: `agents/newsAgent/agent.py`, `backend/app/services/autonomous_stream.py`.

### Published workflow (canvas template)

Best for sharing orchestrator topology (feeds + LLM + tools + CoT).

1. Build canvas → **Publish** → appears in marketplace as **Workflow**.
2. Subscribers **Load onto canvas** → configure API keys → **Run Workflow**.

---

## Quick checklist

```text
□ docker compose up -d
□ copy backend\.env.example → backend\.env (GEMINI_API_KEY, COT_WRAPPER_API_KEY)
□ copy frontend\.env.example → frontend\.env.local
□ copy kalshiSports\.env.example → kalshiSports\.env (keys match backend)
□ npm run dev:backend          (Terminal A)
□ npm run dev:frontend         (Terminal B) → http://localhost:3001
□ python main.py --simulate    (Terminal C) — keep running
□ Marketplace → Install Kalshi Sports Scanner → Live
□ Canvas: Sports Scanner → LLM → CoT Builder
□ LLM: Gemini key + graphId user_771.main.v1
□ CoT Builder: auto-emit ON
□ Run Workflow
□ CoT Graph → user_771.main.v1
□ Optional: Publish workflow → Marketplace → Workflow badge
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Wrapper `connection refused` | Start backend first (`npm run dev:backend`) |
| Marketplace **Offline** for external agent | `python main.py` not running or `COT_WRAPPER_ENABLED=0` |
| `401 Invalid publisher API key` | `COT_PUBLISHER_KEY` in kalshiSports ≠ `COT_WRAPPER_API_KEY` in backend |
| Run Workflow uses demo news signal | No live feed yet — wait for tick, then re-run |
| CoT Graph empty | HOLD decision or CoT not emitted — use non-HOLD + auto-emit |
| Kafka errors in `/api/health` | `docker compose up -d` and wait for redpanda healthy |
| News Agent won't start | Set `COINDESK_API_KEY` in backend `.env` or node config |
| Publish workflow fails | Backend must be running; canvas needs at least one node |

---

## Related files

| Path | Role |
|------|------|
| `kalshiSports/cot_wrapper.py` | HTTP wrapper reference |
| `kalshiSports/README.md` | Scanner strategy + wrapper section |
| `backend/app/external_agents/registry.py` | External marketplace listings |
| `backend/app/signal_registry.py` | Hosted mind agent registry |
| `backend/app/services/workflow_marketplace.py` | Published workflow storage |
| `data/workflows/marketplace.json` | Published workflow JSON store |
| `frontend/components/playground/WrapperGuideModal.tsx` | In-app wrapper docs |
