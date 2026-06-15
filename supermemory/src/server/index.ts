import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../.env") });

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { getSession, handleChat, resetSession, updateEdgeWeight } from "./session.js";
import { isSupermemoryConfigured } from "./supermemory.js";
import { emptyConversationUsage } from "../shared/tokens.js";
import {
  LLM_PROVIDERS,
  resolveLlmConfig,
  type LlmSettingsInput,
} from "../shared/llm.js";

const app = new Hono();

app.use("/api/*", cors());

function envLlmDefaults() {
  return {
    provider: process.env.LLM_PROVIDER,
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL,
  };
}

app.get("/api/health", (c) => {
  const envFallback = resolveLlmConfig(undefined, envLlmDefaults());
  return c.json({
    ok: true,
    supermemoryConfigured: isSupermemoryConfigured(),
    envFallbackConfigured: Boolean(envFallback?.apiKey),
    providers: LLM_PROVIDERS.map((p) => ({
      id: p.id,
      label: p.label,
      defaultModel: p.defaultModel,
      keyPlaceholder: p.keyPlaceholder,
    })),
  });
});

app.get("/api/session", (c) => {
  const sessionId = c.req.query("id");
  const session = sessionId ? getSession(sessionId) : undefined;
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }
  return c.json({
    sessionId: session.id,
    messages: session.messages,
    graph: session.graph,
    tokenUsage: session.tokenUsage,
  });
});

app.post("/api/chat", async (c) => {
  const body = (await c.req.json()) as {
    sessionId?: string;
    message?: string;
    llm?: LlmSettingsInput;
  };
  const message = body.message?.trim();
  if (!message) return c.json({ error: "message is required" }, 400);

  const llm = resolveLlmConfig(body.llm, envLlmDefaults());
  if (!llm) {
    return c.json(
      {
        error:
          "No API key provided. Choose a provider above and paste your key, or set LLM_API_KEY in supermemory/.env as a fallback.",
      },
      400,
    );
  }

  const containerTag = process.env.CONTAINER_TAG?.trim() || "cot-graph-user";
  const result = await handleChat(body.sessionId, message, llm, containerTag);
  return c.json(result);
});

app.post("/api/edge-weight", async (c) => {
  const body = (await c.req.json()) as {
    sessionId?: string;
    edgeId?: string;
    weight?: number;
  };
  if (!body.sessionId?.trim()) return c.json({ error: "sessionId is required" }, 400);
  if (!body.edgeId?.trim()) return c.json({ error: "edgeId is required" }, 400);
  if (typeof body.weight !== "number" || Number.isNaN(body.weight)) {
    return c.json({ error: "weight must be a number in [-1, 1]" }, 400);
  }

  const containerTag = process.env.CONTAINER_TAG?.trim() || "cot-graph-user";
  const result = await updateEdgeWeight(body.sessionId, body.edgeId, body.weight, containerTag);
  if (!result) return c.json({ error: "Session or edge not found" }, 404);
  return c.json(result);
});

app.post("/api/reset", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { sessionId?: string; fresh?: boolean };
  const containerTag = process.env.CONTAINER_TAG?.trim() || "cot-graph-user";
  const session = await resetSession(body.sessionId ?? "", containerTag, Boolean(body.fresh));
  return c.json({
    sessionId: session?.id,
    messages: session?.messages ?? [],
    graph: session?.graph ?? { nodes: [], edges: [] },
    tokenUsage: session?.tokenUsage ?? emptyConversationUsage(),
    supermemoryLoaded: session?.supermemoryLoaded ?? false,
  });
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Graph chat API http://localhost:${port}`);
});
