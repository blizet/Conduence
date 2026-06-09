'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { NewsSignalPayload } from '@/lib/news-signal';

const API_KEY_STORAGE = 'cot-coindesk-api-key';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000/ws';
const NEWS_AGENT_ID = 'newsAgent';

type AgentFeedContextValue = {
  latestNews: NewsSignalPayload | null;
  newsCount: number;
  wsConnected: boolean;
  newsStreamRunning: boolean;
  newsStreamError: string | null;
  feedTopic: string | null;
  filterByCategories: (categories: string[]) => NewsSignalPayload | null;
  startNewsStream: (apiKey?: string) => Promise<{ ok: boolean; error?: string }>;
  stopNewsStream: () => void;
  saveApiKey: (key: string) => void;
  getStoredApiKey: () => string;
};

const AgentFeedContext = createContext<AgentFeedContextValue | null>(null);

function loadStoredApiKey(): string {
  if (typeof window === 'undefined') return '';
  return (
    localStorage.getItem(API_KEY_STORAGE) ??
    process.env.NEXT_PUBLIC_COINDESK_API_KEY ??
    ''
  );
}

function isNewsPayload(payload: unknown): payload is NewsSignalPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return typeof p.headline === 'string' && typeof p.sentiment === 'string';
}

export function AgentFeedProvider({ children }: { children: React.ReactNode }) {
  const [latestNews, setLatestNews] = useState<NewsSignalPayload | null>(null);
  const [newsCount, setNewsCount] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [newsStreamRunning, setNewsStreamRunning] = useState(false);
  const [newsStreamError, setNewsStreamError] = useState<string | null>(null);
  const [feedTopic, setFeedTopic] = useState<string | null>(null);
  const [history, setHistory] = useState<NewsSignalPayload[]>([]);

  const pushSignal = useCallback((payload: NewsSignalPayload) => {
    setLatestNews(payload);
    setNewsCount((c) => c + 1);
    setHistory((h) => [payload, ...h].slice(0, 50));
  }, []);

  const syncStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/marketplace/agents/${NEWS_AGENT_ID}/status`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const body = (await res.json()) as {
        running?: boolean;
        feedTopic?: string;
        lastError?: string;
      };
      setNewsStreamRunning(Boolean(body.running));
      setFeedTopic(body.feedTopic ?? null);
      if (body.lastError) setNewsStreamError(body.lastError);
    } catch {
      /* backend optional on first paint */
    }
  }, []);

  useEffect(() => {
    void syncStatus();
  }, [syncStatus]);

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
          };
          if (msg.type === 'agent.feed' && msg.agent_id === NEWS_AGENT_ID && isNewsPayload(msg.payload)) {
            pushSignal(msg.payload);
            setNewsStreamError(null);
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
  }, [pushSignal]);

  const startNewsStream = useCallback(
    async (apiKey?: string) => {
      const key = (apiKey ?? loadStoredApiKey()).trim();
      if (!key) {
        return {
          ok: false,
          error: 'CoinDesk API key required — set on News Agent node or COINDESK_API_KEY in .env',
        };
      }

      localStorage.setItem(API_KEY_STORAGE, key);

      try {
        const res = await fetch(`${API_URL}/api/marketplace/agents/${NEWS_AGENT_ID}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: key, limit: 20 }),
        });
        const body = (await res.json()) as {
          ok?: boolean;
          running?: boolean;
          feedTopic?: string;
          error?: string;
        };

        if (!res.ok || body.ok === false || body.error) {
          const message = body.error ?? `Start failed (${res.status})`;
          setNewsStreamError(message);
          setNewsStreamRunning(false);
          return { ok: false, error: message };
        }

        setNewsStreamRunning(true);
        setFeedTopic(body.feedTopic ?? `agent.feeds.${NEWS_AGENT_ID}.public`);
        setNewsStreamError(null);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Backend unreachable — start dev:backend';
        setNewsStreamError(message);
        setNewsStreamRunning(false);
        return { ok: false, error: message };
      }
    },
    [],
  );

  const stopNewsStream = useCallback(() => {
    void fetch(`${API_URL}/api/marketplace/agents/${NEWS_AGENT_ID}/stop`, {
      method: 'POST',
    }).finally(() => {
      setNewsStreamRunning(false);
    });
  }, []);

  const saveApiKey = useCallback((key: string) => {
    localStorage.setItem(API_KEY_STORAGE, key);
  }, []);

  const getStoredApiKey = useCallback(() => loadStoredApiKey(), []);

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
      newsStreamRunning,
      newsStreamError,
      feedTopic,
      filterByCategories,
      startNewsStream,
      stopNewsStream,
      saveApiKey,
      getStoredApiKey,
    }),
    [
      latestNews,
      newsCount,
      wsConnected,
      newsStreamRunning,
      newsStreamError,
      feedTopic,
      filterByCategories,
      startNewsStream,
      stopNewsStream,
      saveApiKey,
      getStoredApiKey,
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
