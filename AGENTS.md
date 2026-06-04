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
3. **Kafka (event-sourced):** CoT deltas produce to `market.signals.public` (key=`graph_id`, header `publisher_id`). **PublisherWorker** and **SeekerWorker** consume and MERGE into isolated FalkorDB graphs (`user_117.publisher.v1`, `user_902.seeker.v1`) via Cypher only. No Redis Stack mirror (`cotn:`/`cote:`/`cotd:`), no DB CDC.
4. **User registry (Redis):** `cot:registry:{User_id}:agents`, `cot:registry:{User_id}:graph:{role}`, `cot:registry:{User_id}:topic:{role}`.
5. Trade thesis lives on the `market → trade` edge (`Action` + `metadata.thesis`).
6. Correlated markets use `targets[]` and `direction: "bi-directional"`.
7. Never edit files in `data/raw/`.

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

## CLI / runtime (TypeScript stack)

```bash
docker compose up -d
npm install
npm run dev:backend      # NestJS Fastify :4000 + Kafka consumer + WS
npm run dev:frontend     # Next.js dashboard :3001
npm run seed             # publish data/decisions → Redpanda
npm run dummy-agent      # simulate agents (optional)
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
- Graph name: `eth_market_v1` (from `eth.market.v1`)
- Sync: `cot falkordb-sync`
- API: `redis://localhost:6380`

## Redpanda (event stream GUI)

- **Redpanda Console**: http://localhost:8080
- Topic: `market.signals.public` — `PublisherWorker` / `SeekerWorker` consumer groups
- Sync: `cot redpanda-sync`
- Kafka: `localhost:19092`

## All GUIs

Run `cot services` for the full URL table. See `docs/services.md`.

## Neo4j

- Start: `docker compose up -d`
- Browser: http://localhost:7474 (neo4j / cot-kb-password)
- Ingest passes full JSON as `$payload` — see `cypher/ingest.cypher`

Example query:

```cypher
MATCH (d:Decision)-[:ASSERTED]->(r)-[:BUY_YES|SELL_YES|BUY_NO|SELL_NO*0..1]-()
RETURN d.decision_id, d.updated_at ORDER BY d.updated_at
```

## Obsidian

Open this repo as an Obsidian vault. View `wiki/`, `data/raw/`, and graph output. Use Marp/Dataview plugins as needed.
