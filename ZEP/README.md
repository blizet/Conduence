# Zep Trading Assistant

A chat-based trading assistant (Python) that talks to you about prediction
markets / tradable assets, and incrementally builds a knowledge graph of
your interests, sentiment, and influences using [Zep](https://www.getzep.com).

Everyone running this locally points at the **same Zep project graph**
(no per-instance state) — Zep Cloud is the single source of truth, so as
long as you all use the same `ZEP_API_KEY`, you're collaborating on the
same graph.

**Note on layout:** the application modules live in `app/`. The server is
FastAPI (ASGI), run locally with `python app/server.py` (uvicorn). Voice chat
is embedded in the same server — no separate port needed.

## How it's organized

```
app/config.py             # env / settings loading
app/ontology.py           # Conduence entity + edge ontology
app/setup_ontology.py     # pushes ontology to your Zep project
app/zep_client.py         # thin wrapper around the Zep SDK
app/llm.py                # provider-agnostic text LLM layer
app/chat_agent.py         # text chat loop: LLM + Zep memory/graph
app/server.py             # FastAPI server (text + WebRTC voice, single port)
app/voice_agent.py        # Pipecat voice agent
app/cli.py                # optional terminal chat
app/templates/            # chat page templates
app/static/               # chat + graph UI assets
api/index.py              # Vercel serverless Flask entrypoint
.env.example
requirements.txt
```

## Setup

1. **Install deps**

   ```bash
   python -m venv .venv
   .venv\Scripts\activate        # Windows
   source .venv/bin/activate     # macOS/Linux
   pip install -r requirements.txt
   pip install -r requirements-local.txt   # optional: Pipecat voice (local server only)
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
   python app/setup_ontology.py
   ```

   This registers the Conduence ontology (`Preference`, `GeoFactors`, `Person`,
   `Event`, `EconomicActor`, `AiAgent`, `Rule`) and its edge types against your
   Zep project. Re-run it any time `app/ontology.py` changes — it replaces the
   whole ontology, so it's idempotent.

   The app creates/updates Zep users with default ontology disabled, so graph
   extraction uses these custom entity and edge types only.

4. **Run the web app**

   ```bash
   python app/server.py
   ```

   Then open **http://localhost:5000** in your browser.

   This currently runs as **one shared chat** — everyone who opens the
   page is talking to the same Zep user and the same graph, on one thread
   for the life of the server process. (Per-person login can be added
   later without touching any of the graph/ontology code.)

   To use a different LLM provider for a single run without touching
   `.env`, set `LLM_PROVIDER` in your shell before running, e.g.:

   ```bash
   LLM_PROVIDER=openai python app/server.py        # macOS/Linux
   $env:LLM_PROVIDER="openai"; python app/server.py # Windows PowerShell
   ```

### Voice agent (embedded, same port)

Voice is built into the main server — no separate process or port. The default
stack is:

```text
Deepgram STT → OpenAI LLM → Cartesia TTS   (Pipecat SmallWebRTC transport)
```

Configure in `.env`:

- `DEEPGRAM_API_KEY`
- `OPENAI_API_KEY` (or `VOICE_LLM_PROVIDER=gemini` + `GEMINI_API_KEY`)
- `CARTESIA_API_KEY` + `CARTESIA_VOICE_ID`

All dependencies are in a single file:

```bash
pip install -r requirements.txt
```

Start the server (text + voice on one port):

```bash
python app/server.py
```

Open **http://localhost:5000**, click the **Voice** tab in the header, then
**Connect**. WebRTC activates your microphone and connects the Pipecat voice
pipeline. Graph updates happen the same way as text — voice transcripts flow
through the same Zep memory pipeline.

See `VOICE_TRANSPORT.md` for the transport decision rationale.

### Prefer the terminal?

```bash
python app/cli.py --user-id alice
python app/cli.py --user-id alice --provider gemini
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
python app/inspect_graph.py --user-id shared-user
python app/reset_user.py --user-id shared-user
```

(Use whatever `--user-id` you're actually chatting as — `shared-user` is
the default the web app uses; CLI users pass their own `--user-id`.)
