import './load-env';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import type { GeminiTradeDecision, MainInferenceInput } from '../agents/types';
import { MAIN_GEMINI_MIN_INTERVAL_MS } from './main-agent.config';

const GeminiDecisionSchema = z.object({
  action: z.enum(['BUY_YES', 'BUY_NO', 'HOLD']),
  market_id: z.string().min(1),
  market_slug: z.string().optional(),
  market_title: z.string().optional(),
  condition_id: z.string().optional(),
  conviction_level: z.number().min(1).max(10),
  thesis: z.string(),
  tags: z.array(z.string()),
  reasoning: z.string(),
});

const SYSTEM_PROMPT = `You are a Polymarket trading orchestrator.
Analyze news sentiment, correlated markets, and whale wallet activity.
Output ONLY valid JSON matching this schema:
{
  "action": "BUY_YES" | "BUY_NO" | "HOLD",
  "market_id": "string (required — use a polymarket id from correlated.polymarket, or NONE if empty)",
  "market_slug": "optional string",
  "market_title": "optional string",
  "condition_id": "optional string",
  "conviction_level": 1-10,
  "thesis": "short trade thesis",
  "tags": ["#tag1", "#tag2"],
  "reasoning": "brief chain-of-thought"
}
Rules:
- Only recommend BUY_YES or BUY_NO on Polymarket markets present in correlated.polymarket.
- Prefer markets with whale activity alignment and news sentiment support.
- Return HOLD if conviction is low or signals conflict.
- ALWAYS include market_id as a string (never null). Use NONE when no polymarket market applies.
- Do not wrap JSON in markdown fences. Never reply with plain text only.`;

let lastGeminiCallAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const objMatch = candidate.match(/\{[\s\S]*\}/);
    if (objMatch) return JSON.parse(objMatch[0]);
    return candidate;
  }
}

function pickDefaultMarketId(input: MainInferenceInput): string {
  return input.correlated.polymarket[0]?.id ?? 'NONE';
}

function normalizeGeminiPayload(
  parsed: unknown,
  input: MainInferenceInput,
): Record<string, unknown> {
  if (typeof parsed === 'string') {
    const upper = parsed.trim().toUpperCase();
    const action = upper.includes('BUY_YES')
      ? 'BUY_YES'
      : upper.includes('BUY_NO')
        ? 'BUY_NO'
        : 'HOLD';
    return {
      action,
      market_id: pickDefaultMarketId(input),
      conviction_level: 1,
      thesis: 'No actionable Polymarket trade from model response',
      tags: input.news.keywords.map((k) => `#${k}`).slice(0, 4),
      reasoning: parsed.trim().slice(0, 300),
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Gemini returned non-object response');
  }

  const obj = { ...(parsed as Record<string, unknown>) };
  const action = (obj.action as string | undefined) ?? 'HOLD';
  obj.action = action;

  const marketId = obj.market_id;
  if (marketId == null || marketId === '') {
    obj.market_id = pickDefaultMarketId(input);
  }

  if (typeof obj.conviction_level !== 'number') {
    obj.conviction_level = action === 'HOLD' ? 1 : 5;
  }
  if (typeof obj.thesis !== 'string' || !obj.thesis) {
    obj.thesis = action === 'HOLD' ? 'Low conviction — holding' : 'Trade thesis';
  }
  if (!Array.isArray(obj.tags)) obj.tags = [];
  if (typeof obj.reasoning !== 'string') obj.reasoning = '';

  return obj;
}

function parseRetryDelayMs(message: string): number | null {
  const match = message.match(/retry in ([\d.]+)s/i);
  if (!match) return null;
  return Math.ceil(Number(match[1]) * 1000) + 500;
}

export function isGeminiRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('429') || msg.includes('quota') || msg.includes('Too Many Requests');
}

export function describeGeminiQuotaError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('prepayment credits are depleted')) {
    return 'Gemini prepay credits depleted — add credits at https://aistudio.google.com';
  }
  if (msg.includes('free_tier') || msg.includes('FreeTier')) {
    return 'Gemini free-tier daily quota exhausted for this model';
  }
  if (msg.includes('429') || msg.includes('Too Many Requests')) {
    return 'Gemini rate limited — retry later or raise quotas in AI Studio';
  }
  return 'Gemini API error';
}

function isRateLimitError(err: unknown): boolean {
  return isGeminiRateLimitError(err);
}

export class GeminiClient {
  private readonly model;

  constructor(
    apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
    modelName = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite',
  ) {
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is required for Main Agent inference. ' +
          'Add it to backend/.env (get a key at https://aistudio.google.com/apikey)',
      );
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_PROMPT,
    });
  }

  async inferTradeDecision(input: MainInferenceInput): Promise<GeminiTradeDecision> {
    const sinceLast = Date.now() - lastGeminiCallAt;
    if (sinceLast < MAIN_GEMINI_MIN_INTERVAL_MS) {
      await sleep(MAIN_GEMINI_MIN_INTERVAL_MS - sinceLast);
    }

    const payload = {
      news: {
        headline: input.news.headline,
        sentiment: input.news.sentiment,
        keywords: input.news.keywords,
        source: input.news.source,
        url: input.news.url,
      },
      correlated: {
        polymarket: input.correlated.polymarket,
        kalshi: input.correlated.kalshi,
        correlations: input.correlated.correlations,
      },
      whaleActivity: input.whales.entries,
    };

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        lastGeminiCallAt = Date.now();
        const result = await this.model.generateContent(JSON.stringify(payload));
        const text = result.response.text();
        const parsed = extractJson(text);
        const normalized = normalizeGeminiPayload(parsed, input);
        return GeminiDecisionSchema.parse(normalized);
      } catch (err) {
        if (!isRateLimitError(err) || attempt === maxAttempts) throw err;
        const delay = parseRetryDelayMs(String(err)) ?? 15_000 * attempt;
        console.warn(`[main-agent] Gemini rate limited — retrying in ${delay}ms`);
        await sleep(delay);
      }
    }

    throw new Error('Gemini inference failed after retries');
  }
}
