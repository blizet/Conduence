import type { LlmConfig } from "../shared/llm.js";
import type { LlmGraphResponse } from "../shared/types.js";
import type { RawTurnTokenUsage } from "../shared/tokens.js";

const SYSTEM_PROMPT = `Causal graph assistant. Token-efficient: short replies, dense follow-ups.

Tasks:
1. Extract nodes (event|asset|market|concept) and directed edges from user text.
2. Edge weight ∈ [-1,1]: (0,1]=direct, [-1,0)=inverse, 0=none. Leave weight null unless user gave numbers.
3. New edges: expected_sign 1 if target rises, -1 if target falls.
4. Do NOT ask for weights in assistant_message — the server appends a numbered weight form.
5. If user sends numbered/bulk weights (1:0.8 2:-0.7), emit ALL matching weight_updates at once.
6. Follow-ups: one tight question packing max detail (missing nodes, ambiguous direction, timeframe, magnitude). No filler.

Weight parsing: 8/10→0.8, strong→0.75; apply expected_sign if unsigned.

JSON only:
{"assistant_message":"≤2 short sentences","nodes":[...],"edges":[...],"weight_updates":[{"edge_id":"...","weight":0.8}]}

Rules: reuse node ids; delta only; no weight prose in assistant_message.`;

export interface LlmCallResult {
  response: LlmGraphResponse | null;
  usage: RawTurnTokenUsage | null;
}

export async function callGraphLlm(
  config: LlmConfig,
  userPrompt: string,
): Promise<LlmCallResult> {
  const { text, usage } = await completeJson(config, SYSTEM_PROMPT, userPrompt);
  if (!text) return { response: null, usage };

  try {
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      response: {
        assistant_message: String(parsed.assistant_message ?? "Updated."),
        nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
        edges: Array.isArray(parsed.edges) ? parsed.edges : [],
        weight_updates: Array.isArray(parsed.weight_updates) ? parsed.weight_updates : [],
      },
      usage,
    };
  } catch {
    return { response: null, usage };
  }
}

interface CompleteResult {
  text: string | null;
  usage: RawTurnTokenUsage | null;
}

async function completeJson(
  config: LlmConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<CompleteResult> {
  const temperature = 0.3;
  const maxTokens = 1024;

  if (config.provider === "openai") {
    return openaiComplete(config, systemPrompt, userPrompt, temperature, maxTokens);
  }
  if (config.provider === "claude") {
    return claudeComplete(config, systemPrompt, userPrompt, temperature, maxTokens);
  }
  return geminiComplete(config, systemPrompt, userPrompt, temperature, maxTokens);
}

function normalizeUsage(
  input: number | undefined,
  output: number | undefined,
  total?: number,
): RawTurnTokenUsage {
  const inputTokens = input ?? 0;
  const outputTokens = output ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: total ?? inputTokens + outputTokens,
  };
}

async function geminiComplete(
  config: LlmConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
): Promise<CompleteResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!response.ok) return { text: null, usage: null };
  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  const meta = body.usageMetadata;
  return {
    text: body.candidates?.[0]?.content?.parts?.[0]?.text ?? null,
    usage: meta
      ? normalizeUsage(meta.promptTokenCount, meta.candidatesTokenCount, meta.totalTokenCount)
      : null,
  };
}

async function openaiComplete(
  config: LlmConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
): Promise<CompleteResult> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!response.ok) return { text: null, usage: null };
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const usage = body.usage
    ? normalizeUsage(body.usage.prompt_tokens, body.usage.completion_tokens, body.usage.total_tokens)
    : null;
  return {
    text: body.choices?.[0]?.message?.content ?? null,
    usage,
  };
}

async function claudeComplete(
  config: LlmConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
): Promise<CompleteResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      temperature,
      system: `${systemPrompt}\n\nRespond with JSON only.`,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!response.ok) return { text: null, usage: null };
  const body = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const texts = (body.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "");
  const usage = body.usage
    ? normalizeUsage(body.usage.input_tokens, body.usage.output_tokens)
    : null;
  return {
    text: texts.join("\n") || null,
    usage,
  };
}
