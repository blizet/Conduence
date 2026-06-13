# Architecture — Sub-agents, Orchestrator, Tools

This repo has three composable layers. Each layer is a **template** that the user wires
together on the React Flow canvas. The wiring (edges) decides what data flows where at
runtime.

```
                    ┌──────────────┐
            ┌──────►│  Sub-agent   │──── emits signal ────┐
            │       │  (News / Arb)│                      │
   data     │       └──────────────┘                      ▼
  source ───┤                                       ┌──────────────┐         ┌──────────┐
            │                                       │ Orchestrator │ ──────► │ CoT /    │
            │       ┌──────────────┐                │ (LangGraph)  │         │ Output   │
            └──────►│    Tool      │ ──── enriches ►│              │         └──────────┘
                    │ (CoinGecko…) │                └──────┬───────┘
                    └──────────────┘                       │
                                                           └── invokes tools in parallel
```

- **Sub-agents** produce signals (they are the *only* layer that streams events).
- **Tools** are stateless async functions wrapping one external API call.
- **Orchestrator** is a LangGraph that consumes a signal, optionally calls tools,
  and emits a trade decision.

Whether a tool/sub-agent participates in a run is determined entirely by **whether
the user drew an edge to it on the canvas.**

---

## 1. Sub-agents — signal producers

Each sub-agent is a **standalone template**: it owns its data source, its LLM, and
the schema of the signal it emits. It does not depend on the orchestrator being
present; it just streams to a Kafka topic and via WebSocket.

| Sub-agent | Data source | LLM job | Polls |
| --- | --- | --- | --- |
| **News** (`newsAgent`) | CoinDesk public API | classify headline → `sentiment`, `direction`, `strength`, `keywords`, `categories`, `thesis` | default 30 s |
| **Arbitrage** (`arbitrageAgent`) | Polymarket Gamma + Kalshi (concurrent) | verify two markets resolve on the **same event** and write the per-opportunity thesis | default 15 s |

Both sub-agents now **refuse to run** unless three fields are provided on the
node: `llmProvider` (`openai` / `claude` / `gemini`), `llmApiKey`, and `model`.
Validation lives in `_validate_llm_config` in each sub-agent file. The shared
LLM client is `backend/app/llm/client.py` (`complete_json`).

Common signal shape:

```jsonc
{
  "type": "news" | "arbitrage",
  "agent": "newsAgent" | "arbitrageAgent",
  "direction": "bullish" | "bearish" | "neutral",
  "strength": 0.0,        // float, LLM-inferred conviction
  "keywords": [],
  "thesis": "",           // LLM-written one-liner
  "ts": "iso8601",
  // …plus type-specific fields (headline/url for news, opportunity/legs for arb)
}
```

Registry: `backend/app/subagents/registry.py` exposes each sub-agent with a
`streamSignals(config)` async generator and a `validateConfig(config)` gate.
The `requiredTools` field on each entry is **documentation only** today — it
lists tools the sub-agent *can* benefit from if snapped on the canvas (e.g.
News lists `cryptonews` + `tavily` for richer enrichment).

Sub-agent files:
- `backend/app/subagents/news_subagent.py`
- `backend/app/subagents/arbitrage_subagent.py`
- `backend/app/subagents/news_coindesk.py` — CoinDesk fetcher used by News
- `backend/app/subagents/registry.py`

---

## 2. Tools — stateless async endpoints

A tool is a single async function `f(params: dict) -> dict` returning
`{ ok, source, request, data, error }`. There is no class hierarchy; the
contract is the dict shape.

Registered in `backend/app/orchestrator/tools_registry.py`:

```python
TOOL_HANDLERS = {
    "coingecko":        fetch_coingecko,         # price
    "coinmarketcap":    fetch_coinmarketcap,     # price
    "polymarketGamma":  fetch_gamma_markets,     # markets
    "polymarketWallet": fetch_polymarket_wallet, # markets
    "cryptonews":       fetch_cryptonews,        # research
    "tavily":           fetch_tavily,            # research
    "cryptoquant":      fetch_cryptoquant,       # on-chain
    "defillama":        fetch_defillama,         # macro / TVL
    "clob":             _invoke_clob,            # execution (Polymarket)
    "kalshi":           _invoke_kalshi,          # execution (Kalshi)
}
```

`ToolRegistry.invoke_parallel(calls)` runs the list concurrently with a cap
of `MAX_ENRICHMENT_CALLS = 6` per run. Errors don't abort the run — they're
returned as `{ ok: false, error }` on the per-tool result so the orchestrator
can decide what to do.

`backend/app/orchestrator/tool_specs.py` carries the LLM-facing
**descriptions** of each tool (when to use, when not, parameter schema) so
the orchestrator can choose tools at planning time.

---

## 3. Orchestrator — LangGraph router + LLM synthesizer

The orchestrator turns a single inbound signal into a single trade decision.
It is a LangGraph (`backend/app/orchestrator/graph.py`) with these nodes
(implementations in `backend/app/orchestrator/nodes.py`):

```
ingest_signal
       │
       ▼
   route_signal ──► fast_publish_arbitrage ──► END       (arbitrage)
       │
       ├──────► context_only ──► END                     (neutral & non-news)
       │
       └──────► remember_signal
                       │
                       ▼
                   match_graph     (correlation / decision graph lookup)
                       │
                       ▼
                   plan_tools      (which connected tools to call)
                       │
                       ▼
                   invoke_tools    (parallel via ToolRegistry)
                       │
                       ▼
                   evaluate        (DecisionEngine ranks)
                       │
                       ▼
                   llm_synthesize  (LLM writes final decision JSON)
                       │
                       ▼
                   publish_outputs (emit CoT if cotBuilder is wired)
```

Routing logic in `route_signal` (`nodes.py`):
- `type == "arbitrage"` → **fast path**: arbitrage is market-neutral and
  self-verifying, so it bypasses the LLM and publishes the suggestion directly.
- Neutral signal **and** not a news signal → `context_only`: recorded for
  corroboration but no trade emitted.
- Otherwise → **deliberate path**: tools + LLM synthesis.

Tool planning (`planner.plan_tool_calls`) decides *which* tools to call based
on the signal's keywords and the connected-tool list. It only ever plans a
call to a tool that the canvas marked as connected.

The orchestrator's own LLM (the `LlmNode` on the canvas) writes the final
decision in `llm_synthesize_node` using the synthesis prompt from the node's
config; it falls back to a deterministic decision if no LLM key is provided.

---

## 4. Canvas wiring — how edges map to behavior

The user wires the workflow on the canvas. `backend/app/orchestrator/compile.py`
turns nodes + edges into the runtime config. The edge direction is what matters:

| Edge | Effect |
| --- | --- |
| `Tool ─► Sub-agent`        | Records the tool in `subagent_tools[sub_agent_id]`. The sub-agent can use it for enrichment if it chooses to (current sub-agents have their own fixed data sources, so this is informational today). |
| `Sub-agent ─► Orchestrator (llm)` | Marks the sub-agent as a **connected_subagent**. Its node-data (including LLM creds) is captured in `subagent_configs`. Its signals flow into the orchestrator's run queue. |
| `Tool ─► Orchestrator (llm)`      | Marks the tool as a **connected_tool**. The orchestrator's planner can invoke it during the deliberate path. The tool's `apiKey` (from node-data) is captured in `tool_configs`. |
| `Orchestrator (llm) ─► Output`    | The downstream node (e.g. `cotBuilder`) is added to `output_nodes`. `publish_outputs` emits to it only if the LLM decision is not `HOLD`. |

Example canvas → compiled config:

```
[coingecko] ──► [newsAgent] ──► [llm] ──► [cotBuilder]
[cryptonews] ─►              ▲
[polymarketGamma] ────────────┘
```

Compiles to:
```jsonc
{
  "connected_tools":     ["polymarketGamma"],            // edge tool → llm
  "connected_subagents": ["newsAgent"],                  // edge subagent → llm
  "subagent_tools":      { "newsAgent": ["coingecko", "cryptonews"] }, // edges tool → subagent
  "output_nodes":        [{ "type": "cotBuilder", ... }] // edge llm → output
}
```

`SUB_AGENT_NODE_TYPES`, `PURE_TOOL_NODE_TYPES`, and `ORCHESTRATOR_NODE_TYPE` in
`compile.py` are the source of truth for which node types fall into which
category.

---

## 5. Runtime — what happens when you click "Start sub-agent"

1. **Node UI** — `NewsAgentNode.tsx` / `ArbitrageAgentNode.tsx` collects
   `llmProvider`, `llmApiKey`, `model`, and (for News) the CoinDesk key, then
   calls `startNewsStream(…)` or `startAgent('arbitrageAgent', …)` from
   `frontend/lib/agent-feed.tsx`.
2. **HTTP** — Frontend POSTs `/api/marketplace/agents/<id>/start` with the
   full config object.
3. **API** — `backend/app/api/routes.py` resolves the agent in
   `signal_registry` and delegates to the autonomous-stream service.
4. **Validate** — `validateConfig(config)` runs; for News/Arb this is the
   `_validate_llm_config` check. Missing keys → `400` returned to UI; the
   start button stays "Configure LLM first".
5. **Spawn** — A background task calls `streamSignals(config)` (the
   async generator on the sub-agent).
6. **Emit** — For each yielded signal:
   - publishes to Kafka topic `agent.feeds.<id>.public`,
   - broadcasts to WebSocket clients (the canvas listens here),
   - if the orchestrator is enabled, enqueues the signal into the
     orchestrator run pipeline (`OrchestratorStreamService._loop`).
7. **Orchestrator run** — `runner.run_orchestrator(signal, canvas, config,
   memory)` invokes the compiled LangGraph and returns `{ decision,
   suggestions, cot, tool_results, … }`. Memory carries `recent_signals` so
   the next signal sees corroboration.
8. **UI** — `agent-feed.tsx` updates `agentFeeds[<id>].latest` and the node
   re-renders with the latest signal preview.

`Stop` posts `/api/marketplace/agents/<id>/stop`; the background task is
cancelled and the topic stops receiving new envelopes.

---

## 6. File index

**Sub-agents** (`backend/app/subagents/`)
- `registry.py` — sub-agent catalog + streaming wrappers
- `news_subagent.py` — News (CoinDesk + LLM)
- `arbitrage_subagent.py` — Arbitrage (Polymarket × Kalshi + LLM)
- `news_coindesk.py` — CoinDesk data fetcher

**Orchestrator** (`backend/app/orchestrator/`)
- `graph.py` — LangGraph topology
- `nodes.py` — node implementations
- `compile.py` — canvas → registries
- `planner.py` — picks which tools to invoke
- `tools_registry.py` — tool dispatch table
- `tool_specs.py` — LLM-facing tool descriptions
- `decision_engine.py` — ranks signals into trade suggestions
- `llm_synthesize.py` — LLM writes the final decision JSON
- `graph_registry.py` — correlation + decision context graphs
- `correlation_graph.py` — graph impact propagation
- `skills_registry.py` — per-run callable capability list

**Tools** (`backend/app/tools/`)
- `coingecko.py`, `coinmarketcap.py`, `polymarket_gamma.py`,
  `polymarket_wallet.py`, `cryptonews.py`, `tavily.py`, `cryptoquant.py`,
  `defillama.py`, `clob.py`, `kalshi.py`, `cot_builder.py`

**LLM** (`backend/app/llm/`)
- `client.py` — multi-provider client (`complete_json`) for OpenAI, Gemini, Claude

**API / services** (`backend/app/`)
- `api/routes.py` — HTTP endpoints (marketplace, tools, orchestrator)
- `services/orchestrator_stream.py` — orchestrator background loop
- `signal_registry.py` — marketplace catalog (hosted + external producers)

**Frontend**
- `frontend/nodes/subagents/{NewsAgentNode,ArbitrageAgentNode}.tsx` — sub-agent node UI
- `frontend/nodes/mindagents/LlmNode.tsx` — orchestrator node UI
- `frontend/nodes/tools/*.tsx` — per-tool node UI
- `frontend/nodes/shared/LlmProviderFields.tsx` — reusable provider/model/key block
- `frontend/lib/agent-feed.tsx` — start/stop + WebSocket feed listener
- `frontend/lib/llm-providers.ts` — provider list + default models
- `frontend/lib/dnd.ts` — node default data when dragged from palette
