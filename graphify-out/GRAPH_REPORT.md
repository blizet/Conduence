# Graph Report - .  (2026-06-04)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 627 nodes · 959 edges · 46 communities (41 shown, 5 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 60 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `887a46ba`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]

## God Nodes (most connected - your core abstractions)
1. `DecisionEvent` - 32 edges
2. `FalkorDBStore` - 26 edges
3. `normalizeDecision()` - 24 edges
4. `FalkorDB Server Service` - 24 edges
5. `RedisGraphStore` - 23 edges
6. `RedpandaStore` - 20 edges
7. `Neo4jIngestor` - 18 edges
8. `compilerOptions` - 16 edges
9. `compilerOptions` - 15 edges
10. `Path` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Normalize a single decision event for validation and ingest.` --rationale_for--> `normalizeDecision()`  [EXTRACTED]
  src/cot_kb/normalize.py → backend/src/lib/normalize.ts
- `object` --uses--> `DecisionEvent`  [INFERRED]
  src/cot_kb/ingest.py → src/cot_kb/models.py
- `Service GUIs` --references--> `Neo4j Service`  [EXTRACTED]
  docs/services.md → docker-compose.yml
- `CoT Knowledge Base` --references--> `Neo4j Service`  [EXTRACTED]
  README.md → docker-compose.yml
- `Service GUIs` --references--> `FalkorDB Browser Service`  [EXTRACTED]
  docs/services.md → docker-compose.yml

## Import Cycles
- None detected.

## Communities (46 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (38): Search decisions indexed in Redis Stack., Search wiki markdown (CLI tool for LLM agents)., redis_search(), search(), _escape(), _falkor_url(), _graph_name(), Mirror decision graph into FalkorDB (openCypher) for FalkorDB Browser. (+30 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (40): BaseModel, load_cypher(), decision_event_from_dict(), DecisionEvent, GraphEdge, GraphNode, Provenance, FalkorDB Browser Service (+32 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (8): ApiController, CotDeltaEnvelope, EVENT_TYPE_COT_DELTA, WORKER_TARGETS, decodeHeader(), AppModule, EventsGateway, WsEvent

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (39): falkordb_graphs(), falkordb_sync(), ingest(), ingest_all(), init_project(), _load_decisions(), _neo4j_config(), normalize_cmd() (+31 more)

### Community 4 - "Community 4"
Cohesion: 0.15
Nodes (34): AgentRole, _action_to_relationship(), _ensure_has_agent(), normalize_batch(), Normalize a single decision event for validation and ingest., _slug(), agentNodeId(), AgentRole (+26 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (33): dependencies, falkordb, fastify, kafkajs, @nestjs/common, @nestjs/core, @nestjs/platform-fastify, @nestjs/platform-ws (+25 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (34): additionalProperties, $defs, edge, node, oneOf, $ref, minLength, items (+26 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.19
Nodes (11): _decode(), _edge_hash(), _parse_ft_search(), _parse_ts(), Create RediSearch indexes (idempotent) for RedisInsight browse/search., Parse FT.SEARCH response (list or dict depending on client version)., _redis_url(), float (+3 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (16): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, incremental (+8 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (16): dependencies, next, react, react-dom, @xyflow/react, devDependencies, @types/node, @types/react (+8 more)

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (11): FeedItem, GraphPanelProps, findUserRoot(), isCorrelatedEdge(), LAYER, layerOf(), layoutFallbackGrid(), layoutTree() (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.13
Nodes (14): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at, decision_id (+6 more)

### Community 13 - "Community 13"
Cohesion: 0.27
Nodes (9): loadGeminiDeltas(), resolveGeminiDeltasPath(), intervalMs, loadPublisherSamples(), main(), brokers, main(), decisionsDir (+1 more)

### Community 14 - "Community 14"
Cohesion: 0.14
Nodes (13): devDependencies, concurrently, name, private, scripts, clear-all, dev, dev:backend (+5 more)

### Community 15 - "Community 15"
Cohesion: 0.36
Nodes (7): Lightweight BM25-style search over markdown files (for LLM CLI handoff)., search_markdown(), SearchHit, _tokenize(), int, Path, str

### Community 16 - "Community 16"
Cohesion: 0.25
Nodes (7): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at

### Community 17 - "Community 17"
Cohesion: 0.25
Nodes (7): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at

### Community 18 - "Community 18"
Cohesion: 0.25
Nodes (7): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at

### Community 19 - "Community 19"
Cohesion: 0.25
Nodes (7): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at

### Community 20 - "Community 20"
Cohesion: 0.25
Nodes (7): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at

### Community 21 - "Community 21"
Cohesion: 0.25
Nodes (7): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at

### Community 22 - "Community 22"
Cohesion: 0.25
Nodes (7): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at

### Community 23 - "Community 23"
Cohesion: 0.25
Nodes (7): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at

### Community 24 - "Community 24"
Cohesion: 0.25
Nodes (7): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at

### Community 25 - "Community 25"
Cohesion: 0.25
Nodes (7): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at

### Community 26 - "Community 26"
Cohesion: 0.25
Nodes (7): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at

### Community 27 - "Community 27"
Cohesion: 0.25
Nodes (7): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at

### Community 28 - "Community 28"
Cohesion: 0.25
Nodes (7): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at

### Community 29 - "Community 29"
Cohesion: 0.25
Nodes (7): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at

### Community 30 - "Community 30"
Cohesion: 0.25
Nodes (7): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at

### Community 31 - "Community 31"
Cohesion: 0.25
Nodes (7): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at

### Community 32 - "Community 32"
Cohesion: 0.25
Nodes (7): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at

### Community 33 - "Community 33"
Cohesion: 0.25
Nodes (7): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at

### Community 34 - "Community 34"
Cohesion: 0.25
Nodes (7): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at

### Community 35 - "Community 35"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 36 - "Community 36"
Cohesion: 0.67
Nodes (3): Raw sources, Wiki Log, Prediction Market Knowledge Graph

## Knowledge Gaps
- **285 isolated node(s):** `name`, `private`, `workspaces`, `dev`, `dev:backend` (+280 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DecisionEvent` connect `Community 1` to `Community 0`, `Community 2`, `Community 4`, `Community 6`, `Community 13`?**
  _High betweenness centrality (0.137) - this node is a cross-community bridge._
- **Why does `ingest_decision()` connect `Community 0` to `Community 1`, `Community 3`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `Neo4jIngestor` connect `Community 0` to `Community 1`, `Community 3`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `DecisionEvent` (e.g. with `Neo4jIngestor` and `Any`) actually correct?**
  _`DecisionEvent` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `FalkorDBStore` (e.g. with `Neo4jIngestor` and `RedisGraphStore`) actually correct?**
  _`FalkorDBStore` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `normalizeDecision()` (e.g. with `agentNodeId()` and `graphIdFor()`) actually correct?**
  _`normalizeDecision()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `workspaces` to the rest of the system?**
  _310 weakly-connected nodes found - possible documentation gaps or missing edges._