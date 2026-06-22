'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { NewsSignalPayload } from '@/lib/news-signal';
import type { GraphObservability, GraphObservabilityLlmUsage } from '@/lib/observability-types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000/ws';
const NEWS_AGENT_ID = 'newsAgent';

export type AgentFeedState = {
  latest: unknown;
  count: number;
  running: boolean;
  error: string | null;
  llmUsage?: GraphObservabilityLlmUsage;
  langsmith?: GraphObservability['langsmith'];
};

type AgentFeedContextValue = {
  latestNews: NewsSignalPayload | null;
  newsCount: number;
  wsConnected: boolean;
  agentFeeds: Record<string, AgentFeedState>;
  orchestratorUsage: GraphObservabilityLlmUsage | null;
  orchestratorLangsmith: GraphObservability['langsmith'] | null;
  filterByCategories: (categories: string[]) => NewsSignalPayload | null;
};

const AgentFeedContext = createContext<AgentFeedContextValue | null>(null);

function isNewsPayload(payload: unknown): payload is NewsSignalPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return typeof p.headline === 'string' && typeof p.sentiment === 'string';
}

export function AgentFeedProvider({ children }: { children: React.ReactNode }) {
  const [latestNews, setLatestNews] = useState<NewsSignalPayload | null>(null);
  const [newsCount, setNewsCount] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [history, setHistory] = useState<NewsSignalPayload[]>([]);
  const [agentFeeds, setAgentFeeds] = useState<Record<string, AgentFeedState>>({});
  const [orchestratorUsage, setOrchestratorUsage] = useState<GraphObservabilityLlmUsage | null>(
    null,
  );
  const [orchestratorLangsmith, setOrchestratorLangsmith] = useState<
    GraphObservability['langsmith'] | null
  >(null);

  const pushSignal = useCallback((payload: NewsSignalPayload) => {
    setLatestNews(payload);
    setNewsCount((c) => c + 1);
    setHistory((h) => [payload, ...h].slice(0, 50));
  }, []);

  const patchAgentFeed = useCallback((agentId: string, patch: Partial<AgentFeedState>) => {
    setAgentFeeds((feeds) => {
      const prev = feeds[agentId] ?? {
        latest: null,
        count: 0,
        running: false,
        error: null,
      };
      return { ...feeds, [agentId]: { ...prev, ...patch } };
    });
  }, []);

  const pushAgentSignal = useCallback((agentId: string, payload: unknown) => {
    setAgentFeeds((feeds) => {
      const prev = feeds[agentId] ?? {
        latest: null,
        count: 0,
        running: false,
        error: null,
      };
      return {
        ...feeds,
        [agentId]: {
          ...prev,
          latest: payload,
          count: prev.count + 1,
          running: true,
          error: null,
        },
      };
    });
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      try {
        ws = new WebSocket(WS_URL);
      } catch {
        return;
      }
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => {
        setWsConnected(false);
        retryTimer = setTimeout(connect, 5000);
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type?: string;
            agent_id?: string;
            payload?: unknown;
            llm_usage?: GraphObservabilityLlmUsage;
            langsmith?: GraphObservability['langsmith'];
          };
          if (msg.type === 'orchestrator.result') {
            if (msg.llm_usage) setOrchestratorUsage(msg.llm_usage);
            if (msg.langsmith) setOrchestratorLangsmith(msg.langsmith);
            return;
          }
          if (msg.type !== 'agent.feed' || !msg.agent_id) return;
          pushAgentSignal(msg.agent_id, msg.payload);
          if (msg.llm_usage || msg.langsmith) {
            patchAgentFeed(msg.agent_id, {
              ...(msg.llm_usage ? { llmUsage: msg.llm_usage } : {}),
              ...(msg.langsmith ? { langsmith: msg.langsmith } : {}),
            });
          }
          if (msg.agent_id === NEWS_AGENT_ID && isNewsPayload(msg.payload)) {
            pushSignal(msg.payload);
          }
        } catch {
          /* ignore malformed WS frames */
        }
      };
    };

    connect();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, [pushSignal, pushAgentSignal, patchAgentFeed]);

  const filterByCategories = useCallback(
    (categories: string[]) => {
      if (categories.length === 0) return latestNews;
      return (
        history.find((item) =>
          item.categories.some((c) => categories.includes(c)),
        ) ?? null
      );
    },
    [history, latestNews],
  );

  const value = useMemo(
    () => ({
      latestNews,
      newsCount,
      wsConnected,
      agentFeeds,
      orchestratorUsage,
      orchestratorLangsmith,
      filterByCategories,
    }),
    [
      latestNews,
      newsCount,
      wsConnected,
      agentFeeds,
      orchestratorUsage,
      orchestratorLangsmith,
      filterByCategories,
    ],
  );

  return <AgentFeedContext.Provider value={value}>{children}</AgentFeedContext.Provider>;
}

export function useAgentFeed() {
  const ctx = useContext(AgentFeedContext);
  if (!ctx) throw new Error('useAgentFeed must be used within AgentFeedProvider');
  return ctx;
}

export type { NewsSignalPayload };
