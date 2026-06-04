# Redis Stack & RedisInsight

The ingest pipeline mirrors every decision into **Redis Stack** (RedisJSON + RediSearch) so you can browse and search in **RedisInsight** without writing Cypher.

## Start services

```powershell
docker compose up -d redis
cot redis-init
cot redis-sync    # or cot ingest-all
```

Open http://localhost:8001

## Key layout

| Pattern | Content |
|---------|---------|
| `cotd:{graph_id}:{decision_id}` | Full decision JSON + thesis fields |
| `cotn:{graph_id}:{node_id}` | Entity node (user, market, trade, …) |
| `cote:{graph_id}:{edge_hash}` | Single relationship |
| `cot:meta:{graph_id}:viz:latest` | **Visualization snapshot** — nodes + edges array |
| `cot:meta:{graph_id}:timeline` | Sorted set of decision IDs by time |
| `cot:meta:{graph_id}:info` | Stats + browse hints |

## Visualize in RedisInsight

### 1. Browse JSON documents

- Left sidebar → **Browser**
- Filter: `cotd:eth.market.v1:*`
- Click a key → **JSON** viewer shows nodes, edges, thesis, tags

### 2. Latest graph snapshot

- Open key `cot:meta:eth.market.v1:viz:latest`
- Expand `nodes` and `edges` — compact graph for the most recent ingest
- Use this when you want a quick “what did this decision touch?” view

### 3. RediSearch (Search tab)

Indexes created by `cot redis-init`:

- `idx:cot_decisions` — search theses and trade actions
- `idx:cot_nodes` — filter by `node_type`
- `idx:cot_edges` — filter by `relationship_type`

Example queries:

```
@graph_id:{eth.market.v1} @thesis:(fed macro)
@trade_action:{Buy YES}
@node_type:{market}
```

CLI equivalent:

```powershell
cot redis-search "@thesis:(layer-1)" --json
```

### 4. Timeline

- Browser → key `cot:meta:eth.market.v1:timeline`
- Type: **Sorted Set** — members are `dec-trd_001`, scores are Unix timestamps

### 5. Adjacency sets

- `cot:meta:eth.market.v1:adj:out:PM_ETH_5K` — edge hashes leaving a node
- `cot:meta:eth.market.v1:adj:in:TRD_001` — edge hashes entering a node

Follow an edge hash to `cote:eth.market.v1:{hash}` for full metadata.

## Neo4j vs Redis

| | Neo4j | Redis Stack |
|---|--------|-------------|
| Strength | Graph queries, path finding | Fast browse, JSON, full-text search |
| UI | Neo4j Browser | RedisInsight |
| Ingest | `cypher/ingest.cypher` | `cot_kb/redis_store.py` |

Default `cot ingest` writes to **both**. Use `cot redis-sync` to refresh Redis only.
