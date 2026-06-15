# Weighted Causal Graph Chat

Chat with an LLM to build a **signed causal graph** (edge weights in **[-1, 1]**). The UI visualizes relationships in real time and optionally persists them to **Supermemory**.

- **Positive weights (0 → 1)** — direct relationship (A up → B up)
- **Negative weights (-1 → 0)** — inverse relationship (A up → B down)
- Click an edge in the graph to set or change its weight without typing in chat

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ (20+ recommended)
- API keys:
  - **LLM** — Gemini, OpenAI, or Claude (paste in the UI, or set server fallback in `.env`)
  - **Supermemory** (optional) — for long-term memory and graph restore

## Quick start

### 1. Install dependencies

From the repo root:

```bash
cd supermemory
npm install
```

Or from the monorepo root:

```bash
npm install
cd supermemory && npm install
```

### 2. Configure environment

Copy the example env file and add your keys:

```bash
cp .env.example .env
```

Edit `supermemory/.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPERMEMORY_API_KEY` | Optional | Supermemory API key for persistence and graph restore |
| `LLM_API_KEY` | Optional* | Server-side LLM fallback if you do not paste a key in the UI |
| `LLM_PROVIDER` | Optional | `gemini`, `openai`, or `claude` (default: `gemini`) |
| `LLM_MODEL` | Optional | Model id (default: `gemini-2.0-flash`) |
| `CONTAINER_TAG` | Optional | Supermemory container / user id (default: `cot-graph-user`) |
| `PORT` | Optional | API port (default: `8787`) |

\* You need an LLM key somewhere — either in the UI settings panel or in `.env` as `LLM_API_KEY`.

### 3. Run the app

From `supermemory/`:

```bash
npm run dev
```

From the repo root:

```bash
npm run dev:supermemory
```

This starts:

| Service | URL |
|---------|-----|
| **UI** (Vite) | http://localhost:5174 |
| **API** (Hono) | http://localhost:8787 |

The Vite dev server proxies `/api/*` to the backend.

### 4. Open the UI

1. Go to http://localhost:5174
2. Under **LLM settings**, pick a provider and paste your API key (unless `LLM_API_KEY` is set in `.env`)
3. Describe causal links in chat, e.g. *“If the Iran war escalates, oil rises and crypto falls”*
4. Reply to numbered weight prompts in one message, e.g. `1:0.8 2:-0.7`
5. Or **click an edge** in the graph and use the sidebar slider → **Apply**

## Verify Supermemory (optional)

With `SUPERMEMORY_API_KEY` set in `.env`:

```bash
npx tsx test.ts
```

This checks the Supermemory connection, loads profile context, and writes a test turn.

In the UI:

- **Restore from Supermemory** — new session, hydrate graph from stored memories
- **New session** — blank graph (no restore)

## Production build

```bash
npm run build    # builds the Vite client to dist/
npm start        # API only on PORT (default 8787)
```

Serve the `dist/` folder with any static file host and point it at the API, or run both behind a reverse proxy.

## Project layout

```
supermemory/
├── .env.example          # env template
├── src/
│   ├── client/           # React UI (chat + vis-network graph)
│   ├── server/           # Hono API, session, LLM, Supermemory
│   └── shared/           # types, weight parsing, pricing
├── test.ts               # Supermemory smoke test
└── package.json
```

## API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Provider list, Supermemory / env fallback status |
| `POST` | `/api/chat` | Send a chat message, update graph |
| `POST` | `/api/edge-weight` | Set weight on a single edge |
| `POST` | `/api/reset` | New session (`fresh: true` = blank, `false` = restore from Supermemory) |

## Troubleshooting

- **“No API key provided”** — Add a key in the UI or set `LLM_API_KEY` in `.env`, then restart `npm run dev`.
- **Supermemory badge missing** — Set `SUPERMEMORY_API_KEY` in `.env` and restart the server.
- **Port in use** — Change `PORT` in `.env` and update the Vite proxy in `vite.config.ts` if needed.
- **Graph empty after restore** — Supermemory may have no stored `cot_edge|…` lines yet; chat first, then use **Restore from Supermemory**.
