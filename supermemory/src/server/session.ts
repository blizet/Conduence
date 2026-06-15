import { randomUUID } from "node:crypto";

import type { ChatMessage, ChatApiResponse, WeightedGraph } from "../shared/types.js";
import {
  addTurnUsage,
  emptyConversationUsage,
  withCostUsd,
  type ConversationTokenUsage,
} from "../shared/tokens.js";
import { estimateCostUsd } from "../shared/pricing.js";
import { clampWeight, parseBatchWeightAnswers } from "../shared/weight.js";
import {
  applyLlmDelta,
  createEmptyGraph,
  formatBatchWeightPrompt,
  graphIsComplete,
  graphSummary,
  pendingWeightQuestions,
} from "./graph.js";
import { callGraphLlm } from "./llm.js";
import type { LlmConfig } from "../shared/llm.js";
import {
  fetchSupermemoryContext,
  isSupermemoryConfigured,
  loadGraphFromSupermemory,
  persistToSupermemory,
} from "./supermemory.js";

const MAX_HISTORY_MESSAGES = 12;

export interface Session {
  id: string;
  messages: ChatMessage[];
  graph: WeightedGraph;
  tokenUsage: ConversationTokenUsage;
  supermemoryLoaded: boolean;
}

const sessions = new Map<string, Session>();

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

function welcomeMessage(supermemoryLoaded: boolean, edgeCount: number, fresh: boolean): string {
  if (fresh) {
    return "New blank session. Describe causal links in one message. Weights [-1,1]; missing weights asked in one numbered list.";
  }
  const sm = supermemoryLoaded
    ? `Supermemory loaded ${edgeCount} edge(s) from your prior graph. `
    : isSupermemoryConfigured()
      ? "Supermemory connected. "
      : "Add SUPERMEMORY_API_KEY to supermemory/.env for persistent memory. ";
  return `${sm}Describe causal links in one message. Weights [-1,1]; missing weights asked in one numbered list.`;
}

export async function createSession(containerTag: string, fresh = false): Promise<Session> {
  let graph = createEmptyGraph();
  let supermemoryLoaded = false;

  if (!fresh && isSupermemoryConfigured()) {
    const hydrated = await loadGraphFromSupermemory(containerTag);
    if (hydrated.nodes.length || hydrated.edges.length) {
      graph = hydrated;
      supermemoryLoaded = true;
    }
  }

  const session: Session = {
    id: randomUUID(),
    messages: [
      {
        role: "assistant",
        content: welcomeMessage(supermemoryLoaded, graph.edges.length, fresh),
      },
    ],
    graph,
    tokenUsage: emptyConversationUsage(),
    supermemoryLoaded,
  };
  sessions.set(session.id, session);
  return session;
}

function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
  return messages.slice(-MAX_HISTORY_MESSAGES);
}

function buildUserPrompt(
  session: Session,
  userMessage: string,
  memoryContext: string | null,
): string {
  const pending = pendingWeightQuestions(session.graph);
  const history = trimHistory(session.messages);
  return [
    memoryContext && `ctx:${memoryContext.slice(0, 1200)}`,
    `graph:${graphSummary(session.graph)}`,
    pending.length
      ? `pending:${pending.map((q) => `${q.edgeId}(${q.expectedSign === 1 ? "+" : "-"})`).join(",")}`
      : "pending:none",
    "chat:",
    ...history.map((m) => `${m.role}:${m.content}`),
    `user:${userMessage}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function applyLocalBatchWeightFallback(session: Session, userMessage: string): void {
  const pending = pendingWeightQuestions(session.graph);
  if (!pending.length) return;
  const updates = parseBatchWeightAnswers(userMessage, pending);
  if (!updates.length) return;
  session.graph = applyLlmDelta(session.graph, {
    assistant_message: "",
    weight_updates: updates,
  });
}

function composeReply(llmLine: string, pendingCount: number, batchPrompt: string): string {
  if (!pendingCount) return llmLine.trim() || "Graph complete.";
  const ack = llmLine.trim().split("\n")[0]?.slice(0, 100).trim();
  const skipAck =
    !ack ||
    /weight|rate|how strong|0 to 1|-1 to 0/i.test(ack) ||
    ack.length > 80;
  return skipAck ? batchPrompt : `${ack}\n\n${batchPrompt}`;
}

export async function handleChat(
  sessionId: string | undefined,
  userMessage: string,
  llmConfig: LlmConfig,
  containerTag: string,
): Promise<ChatApiResponse> {
  let active = sessionId ? getSession(sessionId) : undefined;
  if (!active) active = await createSession(containerTag);

  active.messages.push({ role: "user", content: userMessage });
  applyLocalBatchWeightFallback(active, userMessage);

  const { context: memoryContext } = await fetchSupermemoryContext(containerTag, userMessage);
  const { response: llmResult, usage: turnUsage } = await callGraphLlm(
    llmConfig,
    buildUserPrompt(active, userMessage, memoryContext),
  );

  if (turnUsage) {
    const costUsd = estimateCostUsd(llmConfig.provider, llmConfig.model, turnUsage);
    active.tokenUsage = addTurnUsage(active.tokenUsage, withCostUsd(turnUsage, costUsd));
  }

  if (llmResult) {
    active.graph = applyLlmDelta(active.graph, llmResult);
    applyLocalBatchWeightFallback(active, userMessage);
  }

  const pending = pendingWeightQuestions(active.graph);
  const batchPrompt = formatBatchWeightPrompt(pending);
  const reply = composeReply(
    llmResult?.assistant_message ??
      "LLM unavailable — check provider/key in settings.",
    pending.length,
    batchPrompt,
  );

  active.messages.push({ role: "assistant", content: reply });
  await persistToSupermemory(containerTag, userMessage, reply, active.graph);

  return {
    sessionId: active.id,
    message: reply,
    graph: active.graph,
    pendingWeights: pending,
    graphComplete: graphIsComplete(active.graph),
    tokenUsage: active.tokenUsage,
    supermemoryLoaded: active.supermemoryLoaded,
  };
}

export async function resetSession(
  sessionId: string,
  containerTag: string,
  fresh = false,
): Promise<Session> {
  if (sessionId) sessions.delete(sessionId);
  return createSession(containerTag, fresh);
}

export async function updateEdgeWeight(
  sessionId: string,
  edgeId: string,
  weight: number,
  containerTag: string,
): Promise<ChatApiResponse | null> {
  const session = getSession(sessionId);
  if (!session) return null;

  const edge = session.graph.edges.find((e) => e.id === edgeId);
  if (!edge) return null;

  const clamped = clampWeight(weight);
  session.graph = applyLlmDelta(session.graph, {
    assistant_message: "",
    weight_updates: [{ edge_id: edgeId, weight: clamped }],
  });

  const labelById = new Map(session.graph.nodes.map((n) => [n.id, n.label]));
  const src = labelById.get(edge.source) ?? edge.source;
  const tgt = labelById.get(edge.target) ?? edge.target;
  await persistToSupermemory(
    containerTag,
    `[graph] Set weight: ${src} → ${tgt}`,
    `Weight: ${clamped}`,
    session.graph,
  );

  const pending = pendingWeightQuestions(session.graph);
  return {
    sessionId: session.id,
    message: "",
    graph: session.graph,
    pendingWeights: pending,
    graphComplete: graphIsComplete(session.graph),
    tokenUsage: session.tokenUsage,
    supermemoryLoaded: session.supermemoryLoaded,
  };
}
