# News Agent — autonomous CoinDesk polling (@cot-kb/agents)

## Setup

```bash
cp .env.example .env
# Set COINDESK_API_KEY in agents/.env
```

## Run headless (CLI)

From repo root:

```bash
npm run news-agent
```

Or from this package:

```bash
npm run news-agent
```

## Environment (`agents/.env`)

| Variable | Purpose |
|----------|---------|
| `COINDESK_API_KEY` | CoinDesk Data API key (required) |
| `NEWS_ARTICLE_LIMIT` | Articles per poll (default 20) |
| `NEWS_POLL_INTERVAL_MS` | Poll interval (default 60000) |

## Other env locations

| Path | Used when |
|------|-----------|
| **`agents/.env`** | `npm run news-agent` CLI |
| **`backend/.env`** | Nest wrapper starts stream without passing `apiKey` in request |
| **`frontend/.env.local`** | Optional `NEXT_PUBLIC_COINDESK_API_KEY` for playground node default |

Playground / marketplace streaming uses the **backend wrapper** (`COINDESK_API_KEY` in `backend/.env` or key on the News Agent node).

## CoinDesk News API (via `@cot-kb/agents`)

| Endpoint | Path | Client method |
|----------|------|---------------|
| Latest Articles | `/news/v1/article/list` | `fetchLatestArticles` |
| Sources | `/news/v1/source/list` | `fetchSources` |
| Categories | `/news/v1/category/list` | `fetchCategories` |
| Single Article | `/news/v1/article/get` | `fetchArticle` |
| News Search | `/news/v1/search` | `search` |

Backend proxies: `POST /api/agents/coindesk/{articles/list|sources|categories|article/get|search}`
