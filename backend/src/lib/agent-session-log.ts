import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type {
  CorrelatedMarketsResult,
  GeminiTradeDecision,
  NewsSignal,
  WhaleActivityResult,
} from '../agents/types';
import type { DecisionEvent } from '../schemas/decision.schema';
import type { CotIngressResult } from './cot-ingress.client';
import { MAIN_AGENT_LOG, resolveRepoRelativePath } from './main-agent.config';

export type SessionStatus = 'cot_produced' | 'hold' | 'error';

export type AgentSessionRecord = {
  cycle_id: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  status: SessionStatus;
  agents: {
    news_agent: NewsSignal;
    correlated_markets_agent: CorrelatedMarketsResult;
    whale_wallet_agent: WhaleActivityResult;
    main_agent?: { decision: GeminiTradeDecision } | { error: string };
  };
  cot?: DecisionEvent;
  redpanda?: CotIngressResult | { produced: false; error: string };
};

let activeSession: Partial<AgentSessionRecord> | null = null;

function ensureParent(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function beginSession(cycleId?: string): string {
  const id = cycleId ?? new Date().toISOString();
  activeSession = {
    cycle_id: id,
    started_at: new Date().toISOString(),
  };
  return id;
}

export function attachSessionAgents(input: {
  news: NewsSignal;
  correlated: CorrelatedMarketsResult;
  whales: WhaleActivityResult;
}): void {
  if (!activeSession) beginSession();
  const session = activeSession!;
  session.agents = {
    news_agent: input.news,
    correlated_markets_agent: input.correlated,
    whale_wallet_agent: input.whales,
  };
}

export function finalizeSession(record: {
  status: SessionStatus;
  decision?: GeminiTradeDecision;
  error?: string;
  cot?: DecisionEvent;
  ingress?: CotIngressResult;
  ingressError?: string;
}): AgentSessionRecord {
  if (!activeSession?.agents) {
    throw new Error('Session agents not attached before finalize');
  }

  const completedAt = new Date();
  const startedAt = new Date(activeSession.started_at ?? completedAt.toISOString());
  const session: AgentSessionRecord = {
    cycle_id: activeSession.cycle_id!,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_ms: completedAt.getTime() - startedAt.getTime(),
    status: record.status,
    agents: {
      ...activeSession.agents,
      main_agent: record.error
        ? { error: record.error }
        : record.decision
          ? { decision: record.decision }
          : undefined,
    },
  };

  if (record.cot) {
    session.cot = record.cot;
    session.redpanda = record.ingress
      ? record.ingress
      : { produced: false, error: record.ingressError ?? 'not published' };
  }

  writeSession(session);
  activeSession = null;
  return session;
}

function writeSession(session: AgentSessionRecord): void {
  const logPath = resolveRepoRelativePath(MAIN_AGENT_LOG);
  ensureParent(logPath);
  appendFileSync(logPath, `${JSON.stringify(session)}\n`, 'utf-8');
}
