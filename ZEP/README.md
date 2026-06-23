# Zep Trading Assistant

A chat-based trading assistant (Python) that talks to you about prediction
markets / tradable assets, and incrementally builds a knowledge graph of
your interests, sentiment, and influences using [Zep](https://www.getzep.com).

Everyone running this locally points at the **same Zep project graph**
(no per-instance state) — Zep Cloud is the single source of truth, so as
long as you all use the same `ZEP_API_KEY`, you're collaborating on the
same graph.

**Note on layout:** every Python module lives flat in the project root
(no `app/` package). This is deliberate — it means `python server.py` or
`python cli.py` just works from this folder regardless of how it gets
copied/unzipped, with no import path surprises.

## How it's organized

```
config.py          # env / settings loading (incl. which LLM provider)
ontology.py          # Entity + Edge type definitions (pydantic models)
setup_ontology.py     # one-time script: pushes ontology to your Zep project
zep_client.py          # thin wrapper around the Zep SDK (sync)
llm.py                  # provider-agnostic LLM call layer (Anthropic/OpenAI/Gemini)
chat_agent.py            # the actual chat loop: LLM + Zep memory/graph
server.py                 # Flask web server — the main way to use this
cli.py                     # optional terminal chat, same underlying logic
templates/
  index.html               # chat page
static/
  style.css                # chat page styling
  app.js                   # chat page behavior
scripts/
  reset_user.py            # delete + recreate a user's graph (dev convenience)
  inspect_graph.py          # dump a user's nodes/edges for debugging
.env.example
requirements.txt
```

## Setup

1. **Install deps**

   ```bash
   python -m venv .venv
   .venv\Scripts\activate        # Windows
   source .venv/bin/activate     # macOS/Linux
   cd app
   pip install -r requirements.txt
   ```

2. **Configure env vars**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set:

   - `ZEP_API_KEY` — your Zep Cloud project API key. **Everyone who runs
     this should use the same key/project** so you all share one graph.
   - `LLM_PROVIDER` — which model powers the chat agent's replies: one of
     `anthropic`, `openai`, or `gemini`. This only affects who writes the
     assistant's chat text — Zep's own graph extraction is unaffected.
   - `LLM_API_KEY` — the API key for whichever provider you selected above.
     When switching providers, update both `LLM_PROVIDER` and `LLM_API_KEY`
     (or pass `--provider` on the CLI and set the matching key in `.env`).
     Legacy per-provider names (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
     `GEMINI_API_KEY`) still work as fallbacks for the active provider.
   - Optionally override the model per provider via `ANTHROPIC_MODEL`,
     `OPENAI_MODEL`, or `GEMINI_MODEL` (defaults: `claude-sonnet-4-6`,
     `gpt-4o`, `gemini-2.0-flash`).

3. **Push the ontology to Zep (run once per project, not per user)**

   ```bash
   python setup_ontology.py
   ```

   This registers the `User`, `Preference`, `Thing`, `Influencer`, `Event`,
   `Company` entity types and the `INFLUENCES`, `INTERESTED`, `CO_RELATES`
   edge types (each carrying a `proximity` float from -1 to 1) against your
   Zep project. Re-run it any time `ontology.py` changes — it replaces
   the whole ontology, so it's idempotent.

4. **Run the web app**

   ```bash
   python server.py
   ```

   Then open **http://localhost:5000** in your browser.

   This currently runs as **one shared chat** — everyone who opens the
   page is talking to the same Zep user and the same graph, on one thread
   for the life of the server process. (Per-person login can be added
   later without touching any of the graph/ontology code.)

   To use a different LLM provider for a single run without touching
   `.env`, set `LLM_PROVIDER` in your shell before running, e.g.:

   ```bash
   LLM_PROVIDER=openai python server.py        # macOS/Linux
   $env:LLM_PROVIDER="openai"; python server.py # Windows PowerShell
   ```

### Prefer the terminal?

```bash
python cli.py --user-id alice
python cli.py --user-id alice --provider gemini
```

Same underlying logic as the web app, just text-only and per-user instead
of one shared session.

## How the graph gets built

Every message sent is added to the Zep thread via
`client.thread.add_messages(...)`. Zep asynchronously extracts entities
(typed per `ontology.py`) and edges from the conversation and merges them
into that user's graph in the background — you don't call any separate
"extract" step yourself.

Before generating each assistant reply, `chat_agent.py` pulls
`client.thread.get_user_context(...)`, which returns the most relevant
facts/nodes from the user's whole graph (not just this thread) and feeds
that into the system prompt — that's what makes the assistant "remember"
the user's standing preferences and sentiment over time, even in a brand
new conversation.

## Inspecting / resetting the graph

```bash
python scripts/inspect_graph.py --user-id shared-user
python scripts/reset_user.py --user-id shared-user
```

(Use whatever `--user-id` you're actually chatting as — `shared-user` is
the default the web app uses; CLI users pass their own `--user-id`.)
