# Architecture — Sub-agents, Orchestrator, Tools, Workflows

This repo has four composable layers. Each layer is a **template** that the user wires
together on the React Flow canvas. **Edges define execution scope** — which tools and
sub-agents participate in a workflow — not runtime data piping between nodes.

```
                    ┌──────────────┐
            ┌──────►│  Sub-agent   │──── emits signal ────┐
            │       │  (News / Arb)│   (transparent)      │
   tool     │       └──────────────┘                      ▼
  snap  ────┤                                       ┌──────────────┐         ┌──────────┐
            │                                       │ Orchestrator │ ──────► │ CoT /    │
            │       ┌──────────────┐                │ (LangGraph)  │         │ Output   │
            └──────►│    Tool      │ ──── invoke ──►│              │         └──────────┘
                    │ (CoinGecko…) │                └──────┬───────┘
                    └──────────────┘                       │
                                                           └── invokes tools wired to LLM only
```

| Layer | Role | Visibility to orchestrator |
| --- | --- | --- |
| **Sub-agents** (hosted) | Stream signals from snapped tools + fixed `SYSTEM_PROMPT` + optional `userPrompt` | **Transparent** — orchestrator sees `subagent_registry` (tools, userPrompt, capabilities) |
| **Mind agents** (marketplace installs) | External or published workflows | **Black box** — only signals, CoT, and reasoning visible; strategy hidden |
| **Tools** | Stateless async API wrappers | Invoked by sub-agents (snapped) or orchestrator (wired to LLM) |
| **Orchestrator** | LangGraph that consumes signals and emits trade decisions | Sees registries compiled from canvas |

Whether a tool or sub-agent participates is determined entirely by **canvas edges**.

---

## 1. Sub-agents — transparent signal producers

Each hosted sub-agent is a **standalone template**: it fetches data via **snapped tools**
on the canvas (tool registry), runs a fixed `SYSTEM_PROMPT` in code, and accepts an
optional `userPrompt` on the node for strategy focus. It streams to Kafka and WebSocket.

| Sub-agent | Feed tools (wire on left) | LLM job | Polls |
| --- | --- | --- | --- |
| **News** (`newsAgent`) | `cryptonews`, `tavily` (snapped) | classify headline → sentiment, direction, strength, keywords, categories, thesis | default 30 s |
| **Arbitrage** (`arbitrageAgent`) | `polymarketGamma`, `kalshi` (snapped) | verify two markets resolve on the **same event** and write the per-opportunity thesis | default 15 s |

Both sub-agents **refuse to run** unless `llmProvider`, `llmApiKey`, and `model` are set
on the node. Validation lives in `_validate_llm_config` in each sub-agent file. The shared
LLM client is `backend/app/llm/client.py` (`complete_json`).

Common signal shape:

```jsonc
{
  "type": "news" | "arbitrage",
  "agent": "newsAgent" | "arbitrageAgent",
  "direction": "bullish" | "bearish" | "neutral",
  "strength": 0.0,
  "keywords": [],
  "thesis": "",
  "ts": "iso8601"
}
```

Registry: `backend/app/subagents/registry.py` exposes each sub-agent with
`streamSignals(config)` and `validateConfig(config)`. Tool fetching is centralized in
`backend/app/subagents/tool_loop.py`.

Sub-agent files:
- `backend/app/subagents/news_subagent.py`
- `backend/app/subagents/arbitrage_subagent.py`
- `backend/app/subagents/tool_loop.py` — registry-driven tool invocation
- `backend/app/subagents/cot_emit.py` — auto CoT emit when workflow is live
- `backend/app/subagents/registry.py`

---

## 2. Tools — stateless async endpoints

A tool is a single async function `f(params: dict) -> dict` returning
`{ ok, source, request, data, error }`.

Registered in `backend/app/orchestrator/tools_registry.py`:

```python
TOOL_HANDLERS = {
    "coingecko":        fetch_coingecko,
    "coinmarketcap":    fetch_coinmarketcap,
    "polymarketGamma":  fetch_gamma_markets,
    "polymarketWallet": fetch_polymarket_wallet,
    "cryptonews":       fetch_cryptonews,
    "tavily":           fetch_tavily,
    "cryptoquant":      fetch_cryptoquant,
    "defillama":        fetch_defillama,
    "clob":             _invoke_clob,
    "kalshi":           _invoke_kalshi,
}
```

`ToolRegistry.invoke_parallel(calls)` runs concurrently (cap `MAX_ENRICHMENT_CALLS = 6`).
Errors are per-tool `{ ok: false, error }` — they do not abort the run.

`backend/app/orchestrator/tool_specs.py` carries LLM-facing descriptions for orchestrator
planning. Sub-agents receive a `tool_registry` slice from `compile_workflow_context`.

---

## 3. Orchestrator — LangGraph router + LLM synthesizer

The orchestrator turns inbound signals into trade decisions. LangGraph topology in
`backend/app/orchestrator/graph.py`, nodes in `backend/app/orchestrator/nodes.py`:

```
ingest_signal → route_signal → … → llm_synthesize → publish_outputs
```

At ingest, `compile_workflow_context` populates state with:
- `subagent_registry` — transparent metadata for wired sub-agents
- `mind_agent_registry` — black-box feed sources (marketplace installs)
- `orchestrator_registry` — execution tools, visible tools, LLM config
- `workflow_topology` — `has_orchestrator`, `auto_emit_cot`, `publish_as_mind_agent`

`llm_synthesize` receives `subagent_registry_entry` for transparent sub-agents so the
orchestrator LLM can reason about feed context and user strategy focus without seeing
mind-agent internals.

**Skills registry** (`skills_registry.py`): exposes wired tools and sub-agent feed ids to
the orchestrator LLM. Snapped sub-agent tools are **not** duplicated as orchestrator skills
— sub-agents own their tool loop.

---

## 4. Canvas wiring — compile to registries

`backend/app/orchestrator/workflow_context.py` (`compile_workflow_context`) turns nodes +
edges into runtime registries:

| Edge | Effect |
| --- | --- |
| `Tool ─► Sub-agent` | Tool added to sub-agent `execution_tools` + `tool_configs` |
| `Sub-agent ─► Orchestrator (llm)` | Sub-agent in `connected_subagents`; signals flow to orchestrator |
| `Tool ─► Orchestrator (llm)` | Tool in orchestrator `execution_tools` (planner can invoke) |
| `Sub-agent ─► cotBuilder` | Standalone path; `auto_emit_cot` when cotBuilder `autoEmit` is on |
| `Orchestrator (llm) ─► cotBuilder` | Decision path; CoT emitted when decision is not HOLD |

Example:

```
[cryptonews] ──► [newsAgent] ──► [llm] ──► [cotBuilder]
[tavily]     ──►              ▲
[polymarketGamma] ────────────┘
```

Compiles to `subagent_registry.newsAgent.execution_tools = ["cryptonews", "tavily"]`,
`orchestrator_registry.execution_tools = ["polymarketGamma"]`, etc.

---

## 5. Workflow Go Live

**Primary control:** header **Go Live / Stop Live** in the playground (`Playground.tsx`).

1. Frontend POSTs `POST /api/orchestrator/start` with full canvas + optional config
   (`mind_agent_live`, `publishAsMindAgent` when cotBuilder has `autoEmit`).
2. `WorkflowLiveService` (`backend/app/services/workflow_live.py`) compiles context and
   starts **all wired sub-agents** via `AutonomousStreamService`, then the orchestrator
   if an LLM node exists.
3. `POST /api/orchestrator/stop` stops orchestrator and all started sub-agents.
4. `GET /api/orchestrator/workflow/status` reports live state.

Sub-agent nodes and marketplace cards show **Managed by workflow Go Live** when active;
per-agent Start buttons are hidden. **Run Workflow** (single shot) is disabled while live.

CoT auto-emit: when `cotBuilder.autoEmit` is on or `publish_as_mind_agent` is set,
`cot_emit.maybe_emit_cot_for_subagent` publishes decision JSON to Kafka after each signal.

---

## 6. Mind agents vs hosted sub-agents

| | Hosted sub-agent | Mind agent (marketplace) |
| --- | --- | --- |
| Strategy | Transparent (`userPrompt` + tools in registry) | Hidden |
| Start | Workflow Go Live (or legacy per-agent API) | Publisher runs workflow live |
| CoT | Optional via cotBuilder / publish flag | Auto when publisher goes live |
| Publish | N/A | `PublishWorkflowModal` → `publishAsMindAgent` |

Published workflows are stored in `data/workflows/marketplace.json` with secrets stripped.

---

## 7. File index

**Sub-agents** (`backend/app/subagents/`)
- `registry.py`, `news_subagent.py`, `arbitrage_subagent.py`
- `tool_loop.py`, `cot_emit.py`

**Orchestrator** (`backend/app/orchestrator/`)
- `workflow_context.py` — canvas → registries (primary compile)
- `compile.py` — re-export alias
- `graph.py`, `nodes.py`, `planner.py`, `llm_synthesize.py`
- `tools_registry.py`, `tool_specs.py`, `skills_registry.py`
- `graph_registry.py`, `state.py`, `runner.py`

**Services** (`backend/app/services/`)
- `workflow_live.py` — Go Live orchestration
- `workflow_marketplace.py` — publish/browse workflows
- `autonomous_stream.py` — sub-agent background streams
- `orchestrator_stream.py` — orchestrator background loop

**Frontend**
- `frontend/components/playground/Playground.tsx` — Go Live / Stop Live
- `frontend/lib/workflow-live.ts` — workflow live API client
- `frontend/nodes/subagents/{NewsAgentNode,ArbitrageAgentNode}.tsx`
- `frontend/components/playground/{PublishWorkflowModal,AgentMarketplace}.tsx`
- `frontend/lib/dnd.ts` — node defaults including `userPrompt`
