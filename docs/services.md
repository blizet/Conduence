# Service GUIs

All web UIs for the CoT stack. Start everything with:

```powershell
docker compose up -d
cot services
```

| Service | GUI | Port | Purpose |
|---------|-----|------|---------|
| **FalkorDB** | [FalkorDB Browser](http://localhost:3000) | 3000 | **Primary graph store** — one key per graph (`user_117_publisher_v1`, etc.) |
| **Redis Stack** | [RedisInsight](http://localhost:8001) | 6379/8001 | Optional infra only — **NestJS does not write `cotn:`/`cote:`/`cotd:` keys** |
| **Redpanda** | [Redpanda Console](http://localhost:8080) | 8080 | Topics, messages, consumer groups |
| **Neo4j** | [Neo4j Browser](http://localhost:7474) | 7474 | Cypher graph explorer |

## FalkorDB Browser — login

Open http://localhost:3000

**There is no password** on the local FalkorDB server. Leave username and password **empty**.

The UI connects from inside the browser container, so **do not use `localhost:6379`** — that either hits the wrong container or Redis Stack on your machine.

### Option A — FalkorDB URL (recommended)

1. Select **FalkorDB URL**
2. Enter: `redis://falkordb-server:6379`
3. Password: leave blank → **Log in**

### Option B — Manual configuration

| Field | Value |
|-------|-------|
| Host | `falkordb-server` |
| Port | `6379` |
| Username | *(empty)* |
| Password | *(empty)* |
| TLS | off |

### After login

1. Select graph **`user_117_publisher_v1`** or **`user_902_seeker_v1`**
2. If empty: `npm run dev:backend` then `npm run seed`

### Common mistakes

| Wrong | Why it fails |
|-------|----------------|
| `localhost:6379` | Port 6379 on your PC is **Redis Stack**, not FalkorDB |
| Any username/password | FalkorDB server has **no auth** configured |
| `localhost:6380` in Manual | Browser container cannot reach host `localhost`; use `falkordb-server` |

Host port **6380** is only for CLI/tools on your machine (`FALKORDB_URL=redis://localhost:6380`).

## FalkorDB Browser (graph explorer)
4. Run Cypher, e.g.:

```cypher
MATCH (d:Decision)-[:TOUCHES]->(n) RETURN d, n LIMIT 50
```

```cypher
MATCH (m:Market)-[r:BUY_YES]->(t:Trade) RETURN m.node_id, r.action, t.node_id
```

Sync data: `cot falkordb-sync`

## Redpanda Console

1. Open http://localhost:8080
2. Go to **Topics** → `cot.decisions`
3. **Messages** tab — each decision ingest is one JSON event
4. Kafka bootstrap (for apps): `localhost:19092`

Sync data: `cot redpanda-sync`

## RedisInsight

See [redis-insight.md](./redis-insight.md).

Sync data: `cot redis-sync`

## Neo4j Browser

Login: `neo4j` / `cot-kb-password`

```cypher
MATCH (d:Decision) RETURN d ORDER BY d.updated_at DESC LIMIT 20
```

## Ingest all backends

```powershell
cot ingest-all
```

Or selectively:

```powershell
cot ingest-all --no-neo4j --falkordb --redpanda
```
