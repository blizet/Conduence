# CoT Knowledge Base

Decision graph platform: **FastAPI** (orchestration) → **FalkorDB** (graph) → **Next.js** (playground).

## Tech stack

| Layer | Technology |
|-------|------------|
| Graph memory | FalkorDB + openCypher |
| Backend | FastAPI, Pydantic validation, WebSockets |
| Frontend | Next.js, React Flow, WebSocket live feed |
| Agentic graph | Local seed JSON + per-user files under `data/agentic/users/` |

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

# 4. Terminal A — backend (FalkorDB + WS)
npm run dev:backend

# 5. Terminal B — playground
npm run dev:frontend
```

Open **http://localhost:3001**. Use **Go Live** on the workflow canvas to run sub-agents and the orchestrator; CoT decisions MERGE directly into FalkorDB.

## Service GUIs

| UI | URL | Notes |
|----|-----|-------|
| **Playground** | http://localhost:3001 | Next.js + React Flow |
| FalkorDB Browser | http://localhost:3000 | Graph visualization |
| RedisInsight | http://localhost:8001 | Optional (Redis Stack) |

## Architecture

```text
Go Live (playground)
        │
        ▼
Sub-agents + Orchestrator (FastAPI, in-process + WebSocket)
        │
        ▼
CoT emit ──► FalkorDB MERGE (direct, no message bus)
        │
        ▼
Playground graph view + FalkorDB Browser
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/graphs/:graphId/snapshot` | Nodes + edges for React Flow |
| POST | `/api/signals/cot` | MERGE CoT decision into FalkorDB |
| POST | `/api/decisions` | Alias for `/api/signals/cot` |
| WS | `/ws` | Real-time `decision.ingested` events |

## Project layout

```
backend/           FastAPI + FalkorDB
frontend/          Next.js playground (React Flow)
data/agentic/      Macro correlation seed + per-user graph files
data/decisions/    One JSON per decision event
docker-compose.yml FalkorDB, Redis Stack
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
