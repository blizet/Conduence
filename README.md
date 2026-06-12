# CoT Knowledge Base

Decision graph platform: **Redpanda** (events) → **FastAPI** (orchestration) → **FalkorDB** (graph) → **Next.js** (dashboard).

## Tech stack

| Layer | Technology |
|-------|------------|
| Event streaming | Redpanda + KafkaJS |
| Graph memory | FalkorDB + `@falkordb/falkordb` (openCypher) |
| Backend | FastAPI, Pydantic validation, WebSockets |
| Frontend | Next.js, React Flow, WebSocket live feed |

Legacy Python CLI (`src/cot_kb/`) is optional — the primary path is `backend/` + `frontend/`.

## Quick start

> **Windows path note:** The folder name `CoT_!` contains `!`, which breaks Webpack. The frontend uses **Turbopack** (`--turbopack`) to avoid this. If you still hit path errors, rename/move the project to a path without `!` (e.g. `CoT_kb`).

```powershell
# 1. Infrastructure
docker compose up -d

# 2. Install dependencies
npm install
npm run install:backend

# 3. Env files
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env.local

# 4. Terminal A — backend (Kafka consumer + FalkorDB + WS)
npm run dev:backend

# 5. Terminal B — dashboard
npm run dev:frontend

# 6. Terminal C — seed (after backend is up)
npm run seed

# 7. Terminal D — publisher emits every 8s to ONE topic
npm run publisher-agent

# 8. Terminal E — seeker reads publisher topic, writes seeker graph
npm run seeker-agent
```

Open **http://localhost:3001** (your dashboard). Default graph: `user_771.publisher.v1`.

**Full walkthrough** (kalshiSports publisher, marketplace, orchestrator workflow, CoT graph): **[docs/run-setup.md](docs/run-setup.md)**.

**Important:** Start **backend before** `npm run seed`, or messages are published with no consumer and FalkorDB/Redis stay empty.

## Agents

| Agent | Command | Kafka |
|-------|---------|-------|
| Publisher | `npm run publisher-agent` | POST `/api/signals/cot` → `market.signals.public` |
| Seeker | `npm run seeker-agent` | No-op (SeekerWorker in backend) |
| Backend | `npm run dev:backend` | Ingress producer + Publisher/Seeker workers → FalkorDB |

`npm run dummy-agent` is an alias for `publisher-agent`.

## Service GUIs (infra)

| UI | URL | Notes |
|----|-----|-------|
| **CoT Dashboard** | http://localhost:3001 | Next.js + React Flow |
| FalkorDB Browser | http://localhost:3000 | Login: `redis://falkordb-server:6379` |
| Redpanda Console | http://localhost:8080 | Topic `market.signals.public` |
| RedisInsight | http://localhost:8001 | Not used by FastAPI graph ingest (optional legacy Python only) |
| Neo4j Browser | http://localhost:7474 | Optional (legacy Python sync) |

See [docs/services.md](docs/services.md) (if present) and **[docs/run-setup.md](docs/run-setup.md)** for the full playground + kalshiSports + marketplace walkthrough.

## Architecture

```text
POST /api/signals/cot  (npm run seed / publisher-agent / main-agent)
        │
        ▼
Redpanda  market.signals.public  (key=graph_id, header publisher_id)
        │
        ├─ PublisherWorker ──► MERGE user_117.publisher.v1
        ├─ SeekerWorker    ──► MERGE user_902.seeker.v1 (publisher whale mirror)
        └─ MainWorker      ──► MERGE user_771.main.v1 (main-agent CoT)
        │
        ▼
Next.js dashboard (:3001) — REST snapshot + WS feed
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/graphs/:graphId/snapshot` | Nodes + edges for React Flow |
| POST | `/api/signals/cot` | Event-sourced produce (Redpanda only) |
| POST | `/api/decisions` | Alias for `/api/signals/cot` |
| WS | `/ws` | Real-time `decision.ingested` events |

## Project layout

```
backend/           FastAPI + aiokafka + FalkorDB
frontend/          Next.js dashboard (React Flow)
config/            Runtime config (e.g. whale-wallets.json)
data/decisions/    One JSON per decision event
data/logs/         Main-agent log — one JSONL with cycles + CoT (gitignored)
schema/            JSON Schema (mirrored by Zod in backend)
docker-compose.yml Redpanda, FalkorDB, Redis, Neo4j
AGENTS.md          LLM wiki maintainer instructions
```

`npm run seed` publishes **whale/publisher** deltas to `market.signals.public`. `npm run main-agent` publishes CoT to the same topic; **MainWorker** builds `user_771.main.v1` in FalkorDB. All main-agent output is appended to `data/logs/main-agent.jsonl` only.

## FalkorDB Browser login

http://localhost:3000 → **FalkorDB URL**:

```
redis://falkordb-server:6379
```

Graph name: **`eth_market_v1`**

## License

MIT
