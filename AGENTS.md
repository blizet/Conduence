# CoT Knowledge Base — Agent Schema

You maintain a **compounding knowledge base**: immutable raw sources, an LLM-written wiki, and a **decision graph** in Neo4j + Redis Stack. One JSON file = one decision event.

## Directory layout

| Path | Role |
|------|------|
| `data/raw/` | Immutable sources (you read only) |
| `data/decisions/` | One `.json` per decision (you write) |
| `data/sample/decisions-batch.json` | Reference batch of 20 decisions |
| `wiki/` | Compiled markdown wiki (you write) |
| `schema/decision-event.schema.json` | JSON Schema contract |
| `cypher/ingest.cypher` | Neo4j unpack query (do not string-build Cypher) |

## Decision JSON contract

Each decision file must include:

- `graph_id` — namespace (e.g. `user_771.publisher.v1`)
- `updated_at` — ISO-8601 timestamp
- `nodes[]` — `{ node_id, node_type, properties? }`
- `edges[]` — `{ source, target \| targets, Action?, metadata? }`

Optional (recommended): `decision_id`, `schema_version`, `operation`, `provenance`.

**Node types:** `user`, `protocol`, `market`, `trade`, `outcome`, `feedback`, `agent`

**Rules:**

1. Every `edge.source` / `target` must exist in `nodes` (legacy `Publisher Agent` / `publisher_agent` normalize to `{user_slug}.publisher`).
2. **Graph namespace:** `{user_slug}.{agent_role}.v1` (e.g. `user_771.publisher.v1`, `user_771.seeker.v1`).
3. **CoT persistence:** Decision events MERGE directly into FalkorDB via the FastAPI backend (`POST /api/signals/cot` or orchestrator auto-emit). WebSocket broadcasts live sub-agent feeds to the playground.

## Workflows

### Ingest source → wiki + decision

1. User drops source in `data/raw/`.
2. Read source; discuss takeaways with user.
3. Update `wiki/` pages (entities, concepts, synthesis).
4. Write or emit `data/decisions/dec-<trade_id>.json`.
5. Run: `cot validate data/decisions/<file>.json`
6. Run: `cot ingest data/decisions/<file>.json` (updates Neo4j, Redis Stack, and `wiki/log.md`).

### Query

1. Read `wiki/index.md` first.
2. Open relevant wiki pages; use `cot search "<query>" --json` if needed.
3. Answer with citations; file substantial answers as new wiki pages.
4. Optionally emit a new decision JSON if the query implies a new graph assertion.

### Lint

Periodically check: contradictions, stale claims, orphan wiki pages, missing concept pages, edges pointing to missing nodes. Suggest `cot ingest-all` after fixing decision files.

## CLI / runtime

```bash
docker compose up -d
npm install
npm run install:backend  # pip install -r backend/requirements.txt
npm run dev:backend      # FastAPI :4000 + WebSocket + FalkorDB
npm run dev:frontend     # Next.js dashboard :3001
```

Legacy Python `cot` CLI still available under `src/cot_kb/` for Redis/Neo4j sync.

## Redis Stack (visualization)

- Start: `docker compose up -d redis`
- **RedisInsight**: http://localhost:8001
- Init indexes: `cot redis-init`
- Re-sync only Redis: `cot redis-sync`
- Viz snapshot key: `cot:meta:eth.market.v1:viz:latest`
- See `docs/redis-insight.md`

## FalkorDB (graph GUI)

- **FalkorDB Browser**: http://localhost:3000
- API: `redis://localhost:6380`
- Agentic seed graph: `data/agentic/macro_correlation_graph.json`
- User agentic edits: `data/agentic/users/{user_slug}.json`

## All GUIs

Run `cot services` for the full URL table. See `docs/services.md`.

## Obsidian

Open this repo as an Obsidian vault. View `wiki/`, `data/raw/`, and graph output. Use Marp/Dataview plugins as needed.
