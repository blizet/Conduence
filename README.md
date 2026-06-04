# CoT Knowledge Base

Decision graph platform: **Redpanda** (events) → **NestJS/Fastify** (orchestration) → **FalkorDB** (graph) → **Next.js** (dashboard).

## Tech stack

| Layer | Technology |
|-------|------------|
| Event streaming | Redpanda + KafkaJS |
| Graph memory | FalkorDB + `@falkordb/falkordb` (openCypher) |
| Backend | NestJS on Fastify, Zod validation, WebSockets |
| Frontend | Next.js, React Flow, WebSocket live feed |

Legacy Python CLI (`src/cot_kb/`) is optional — the primary path is `backend/` + `frontend/`.

## Quick start

> **Windows path note:** The folder name `CoT_!` contains `!`, which breaks Webpack. The frontend uses **Turbopack** (`--turbopack`) to avoid this. If you still hit path errors, rename/move the project to a path without `!` (e.g. `CoT_kb`).

```powershell
# 1. Infrastructure
docker compose up -d

# 2. Install JS workspace
npm install

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
| RedisInsight | http://localhost:8001 | Not used by NestJS graph ingest (optional legacy Python only) |
| Neo4j Browser | http://localhost:7474 | Optional (legacy Python sync) |

See [docs/services.md](docs/services.md).

## Architecture

```text
Publisher POST /api/signals/cot  (or npm run seed / publisher-agent)
        │
        ▼
Redpanda  market.signals.public  (key=graph_id, header publisher_id)
        │
        ├─ PublisherWorker ──► MERGE user_117.publisher.v1 (FalkorDB only)
        └─ SeekerWorker    ──► verify + MERGE user_902.seeker.v1 (FalkorDB only)
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
backend/           NestJS + Fastify + KafkaJS + FalkorDB
frontend/          Next.js dashboard (React Flow)
data/decisions/    One JSON per decision event
schema/            JSON Schema (mirrored by Zod in backend)
docker-compose.yml Redpanda, FalkorDB, Redis, Neo4j
AGENTS.md          LLM wiki maintainer instructions
```

## FalkorDB Browser login

http://localhost:3000 → **FalkorDB URL**:

```
redis://falkordb-server:6379
```

Graph name: **`eth_market_v1`**

## License

MIT
