# Graph Report - CoT_kb  (2026-06-08)

## Corpus Check
- 112 files · ~33,309 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 894 nodes · 1422 edges · 65 communities (57 shown, 8 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `255314a3`
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
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
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
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]

## God Nodes (most connected - your core abstractions)
1. `normalizeDecision()` - 26 edges
2. `FalkorDB Server Service` - 21 edges
3. `FalkorDbService` - 18 edges
4. `EventsGateway` - 17 edges
5. `compilerOptions` - 16 edges
6. `compilerOptions` - 16 edges
7. `scripts` - 15 edges
8. `ApiController` - 15 edges
9. `WorkflowNode` - 14 edges
10. `scripts` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Service GUIs` --references--> `Neo4j Service`  [EXTRACTED]
  docs/services.md → docker-compose.yml
- `CoT Knowledge Base` --references--> `Neo4j Service`  [EXTRACTED]
  README.md → docker-compose.yml
- `Service GUIs` --references--> `FalkorDB Server Service`  [EXTRACTED]
  docs/services.md → docker-compose.yml
- `CoT Knowledge Base` --references--> `FalkorDB Server Service`  [EXTRACTED]
  README.md → docker-compose.yml
- `Service GUIs` --references--> `FalkorDB Browser Service`  [EXTRACTED]
  docs/services.md → docker-compose.yml

## Import Cycles
- None detected.

## Communities (65 total, 8 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (22): AgentFeedContext, AgentFeedContextValue, AgentFeedProvider(), useAgentFeed(), DEFAULT_INSTALLED, InstalledAgentsContext, InstalledAgentsContextValue, InstalledAgentsProvider() (+14 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (33): AgentsController, FalkorDB Server Service, countQuery(), CypherDeltaResult, cypherNodeLabel(), cypherRelType(), executeCypherDelta(), GraphQueryFn (+25 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (22): ApiController, MarketplaceController, MARKETPLACE_CATALOG, MarketplaceAgentDef, AgentSession, AutonomousAgentStreamService, agentRoleFor(), SignalIngressService (+14 more)

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (14): All GUIs, CLI / runtime (TypeScript stack), CoT Knowledge Base — Agent Schema, Decision JSON contract, Directory layout, FalkorDB (graph GUI), Ingest source → wiki + decision, Lint (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (44): EVENT_TYPE_COT_DELTA, firstExistingPath(), loadDecisionFiles(), loadGeminiDeltas(), parseDecisionFile(), remapUserNodeId(), REPO_ROOT_CANDIDATES, resolveDecisionsDir() (+36 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (41): dependencies, @cot-kb/agents, dotenv, falkordb, fastify, @google/generative-ai, kafkajs, @nestjs/common (+33 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (29): ASSET_TOKENS, buildCorrelations(), buildSearchQueries(), CorrelatedMarketsAgent, expandKeywords(), extractAssets(), FETCH_TIMEOUT_MS, fetchKalshiMarkets() (+21 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (18): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, incremental (+10 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (21): dependencies, next, react, react-dom, vis-data, vis-network, @xyflow/react, devDependencies (+13 more)

### Community 11 - "Community 11"
Cohesion: 0.25
Nodes (3): FeedItem, GraphPanelProps, Playground

### Community 12 - "Community 12"
Cohesion: 0.17
Nodes (14): decision_id, edges, graph_id, nodes, operation, schema_version, updated_at, decision_id (+6 more)

### Community 14 - "Community 14"
Cohesion: 0.11
Nodes (18): devDependencies, concurrently, name, private, scripts, clear-all, dev, dev:backend (+10 more)

### Community 15 - "Community 15"
Cohesion: 0.11
Nodes (27): CORRELATED_MARKETS_LIMIT, firstExistingPath(), loadWhaleWallets(), NEWS_POLL_INTERVAL_MS, REPO_ROOT_CANDIDATES, resolveWhaleWalletsPath(), WHALE_FETCH_DELAY_MS, MarketRef (+19 more)

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

### Community 39 - "Community 39"
Cohesion: 0.11
Nodes (18): ClobExecuteSide, ClobMode, ClobTokenSource, HandleConfig, MarketCategory, WorkflowNode, CATEGORY_LABEL, GlassNode() (+10 more)

### Community 46 - "Community 46"
Cohesion: 0.18
Nodes (10): Agents, API, Architecture, CoT Knowledge Base, FalkorDB Browser login, License, Project layout, Quick start (+2 more)

### Community 47 - "Community 47"
Cohesion: 0.33
Nodes (5): 2026-06-05T18:25:09.081Z | cycle `smoke-test`, Correlated Markets Agent, Main Agent, News Agent, Whale Wallet Agent

### Community 48 - "Community 48"
Cohesion: 0.13
Nodes (19): FETCH_TIMEOUT_MS, fetchGammaByCategory(), fetchGammaMarketBySlug(), fetchTotalisByCategory(), findCorrelatedMarkets(), GammaMarketRaw, KalshiMarketRaw, scoreCorrelation() (+11 more)

### Community 49 - "Community 49"
Cohesion: 0.14
Nodes (16): limit, articleToSignal(), NewsAgent, resolveApiKey(), signalKey(), BEARISH_WORDS, BULLISH_WORDS, CATEGORY_HINTS (+8 more)

### Community 53 - "Community 53"
Cohesion: 0.19
Nodes (9): buildMultiHandles(), LlmNode(), ApiKeyField(), ApiKeyFieldProps, PromptField(), PromptFieldProps, SubagentPromptFields(), SubagentPromptFieldsProps (+1 more)

### Community 56 - "Community 56"
Cohesion: 0.13
Nodes (18): clobAgent, executeClobTrade(), FETCH_TIMEOUT_MS, fetchJson(), getClobQuote(), CLOB, WHALE_NODE_TYPES, ClobExecuteRequest (+10 more)

### Community 57 - "Community 57"
Cohesion: 0.11
Nodes (18): default, dependencies, rss-parser, zod, devDependencies, tsx, @types/node, typescript (+10 more)

### Community 58 - "Community 58"
Cohesion: 0.17
Nodes (15): buildTypeLegend(), computeDegrees(), fetchGraphSnapshot(), GraphSnapshot, GraphSnapshotEdge, GraphSnapshotNode, NODE_TYPE_COLORS, NODE_TYPE_LABELS (+7 more)

### Community 59 - "Community 59"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir, resolveJsonModule (+6 more)

### Community 60 - "Community 60"
Cohesion: 0.15
Nodes (10): createNodeData(), DEFAULTS, getNodeId(), PALETTE_ITEMS, NodeCategory, PaletteItem, WorkflowNodeData, GlassPanel() (+2 more)

### Community 61 - "Community 61"
Cohesion: 0.20
Nodes (5): ToolsController, fetchJson(), fetchMarketBySlug(), fetchPositions(), fetchRecentTrades()

### Community 62 - "Community 62"
Cohesion: 0.33
Nodes (9): FalkorDB Browser Service, Neo4j Service, Redis Stack Service, Redpanda Service, Redpanda Console Service, Redis Stack & RedisInsight, Service GUIs, CoT Knowledge Base (+1 more)

### Community 63 - "Community 63"
Cohesion: 0.22
Nodes (8): coinDeskAgent, FETCH_TIMEOUT_MS, fetchCoinDeskNews(), parseArticles(), COINDESK, CoinDeskArticle, CoinDeskNewsRequest, CoinDeskNewsResult

### Community 65 - "Community 65"
Cohesion: 0.33
Nodes (7): NewsAgentNode(), MARKET_CATEGORIES, useNodeData(), WhaleWalletNode(), ClobToolNode(), CorrelatedMarketsNode(), CotBuilderNode()

### Community 66 - "Community 66"
Cohesion: 0.22
Nodes (8): API keys, Autonomous Agents, Backend API routes, Build, Categories (Totalis correlation), Endpoint registry, Run autonomously, Structure

### Community 67 - "Community 67"
Cohesion: 0.22
Nodes (4): AUTONOMOUS_AGENT_REGISTRY, AutonomousAgentConfig, AutonomousAgentDefinition, listAutonomousAgentFeedTopics()

### Community 68 - "Community 68"
Cohesion: 0.43
Nodes (6): actionLabel(), buildCotDecision(), CotBuilderOptions, nextTradeId(), outcomeNodeId(), GeminiTradeDecision

## Knowledge Gaps
- **416 isolated node(s):** `name`, `private`, `workspaces`, `dev`, `dev:backend` (+411 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `normalizeDecision()` connect `Community 4` to `Community 1`, `Community 2`, `Community 61`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `buildCotDecision()` connect `Community 68` to `Community 61`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `ApiController` connect `Community 2` to `Community 1`, `Community 67`, `Community 4`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `normalizeDecision()` (e.g. with `agentNodeId()` and `graphIdFor()`) actually correct?**
  _`normalizeDecision()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `workspaces` to the rest of the system?**
  _416 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.0773109243697479 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08078431372549019 - nodes in this community are weakly interconnected._