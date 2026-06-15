'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type MarketplaceAgent = {
  id: string;
  nodeType: string;
  name: string;
  description: string;
  autonomous: boolean;
  hosted?: boolean;
  source?: 'hosted' | 'external';
  publisher?: string;
  accent: string;
  core?: boolean;
  feedTopic?: string;
  eventType?: string;
};

const STORAGE_KEY = 'cot-installed-mind-agents';
const DEFAULT_INSTALLED = ['llm'];

export const FALLBACK_CATALOG: MarketplaceAgent[] = [
  {
    id: 'llm',
    nodeType: 'llm',
    name: 'Orchestrator',
    description: 'Main agent — synthesizes feeds into trade decisions',
    autonomous: false,
    hosted: true,
    source: 'hosted',
    accent: '#f472b6',
    core: true,
  },
  {
    id: 'newsAgent',
    nodeType: 'newsAgent',
    name: 'News Agent',
    description: 'Autonomous CoinDesk feed → Redpanda topic agent.feeds.newsAgent.public',
    autonomous: true,
    hosted: true,
    source: 'hosted',
    accent: '#fb923c',
    feedTopic: 'agent.feeds.newsAgent.public',
  },
  {
    id: 'arbitrageAgent',
    nodeType: 'arbitrageAgent',
    name: 'Arbitrage Agent',
    description:
      'Polymarket × Kalshi cross-platform arb scanner — fee-aware net edge, same-event matching',
    autonomous: true,
    hosted: true,
    source: 'hosted',
    accent: '#c084fc',
    feedTopic: 'agent.feeds.arbitrageAgent.public',
  },
  {
    id: 'riskAnalyzer',
    nodeType: 'riskAnalyzer',
    name: 'Risk Analyzer',
    description: 'Position sizing from trade proposal + portfolio risk limits → agent.feeds.riskAnalyzer.public',
    autonomous: true,
    hosted: true,
    source: 'hosted',
    accent: '#fbbf24',
    feedTopic: 'agent.feeds.riskAnalyzer.public',
  },
  {
    id: 'sportsScanner.user_demo',
    nodeType: 'sportsScanner',
    name: 'Kalshi Sports Scanner',
    description: 'Late-game Kalshi soccer paper trades — external publisher via HTTP wrapper',
    autonomous: true,
    hosted: false,
    source: 'external',
    publisher: 'user_demo',
    accent: '#4ade80',
    feedTopic: 'agent.feeds.sportsScanner.user_demo.public',
    eventType: 'market_tick.signal',
  },
];

type InstalledAgentsContextValue = {
  catalog: MarketplaceAgent[];
  installed: Set<string>;
  install: (id: string) => void;
  uninstall: (id: string) => void;
  isInstalled: (id: string) => boolean;
};

const InstalledAgentsContext = createContext<InstalledAgentsContextValue | null>(null);

function loadInstalled(): string[] {
  if (typeof window === 'undefined') return DEFAULT_INSTALLED;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_INSTALLED;
    const parsed = JSON.parse(raw) as string[];
    return parsed.includes('llm') ? parsed : ['llm', ...parsed];
  } catch {
    return DEFAULT_INSTALLED;
  }
}

export function isExternalAgent(agent: MarketplaceAgent): boolean {
  return agent.source === 'external' || agent.hosted === false;
}

export function InstalledAgentsProvider({ children }: { children: React.ReactNode }) {
  const [installedIds, setInstalledIds] = useState<string[]>(DEFAULT_INSTALLED);
  const [catalog, setCatalog] = useState<MarketplaceAgent[]>(FALLBACK_CATALOG);

  useEffect(() => {
    setInstalledIds(loadInstalled());
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/api/marketplace/agents`, { cache: 'no-store' });
        if (!res.ok) return;
        const body = (await res.json()) as { agents?: MarketplaceAgent[] };
        if (body.agents?.length) setCatalog(body.agents);
      } catch {
        /* use fallback catalog */
      }
    })();
  }, []);

  const persist = useCallback((ids: string[]) => {
    setInstalledIds(ids);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  }, []);

  const install = useCallback(
    (id: string) => {
      if (installedIds.includes(id)) return;
      persist([...installedIds, id]);
    },
    [installedIds, persist],
  );

  const uninstall = useCallback(
    (id: string) => {
      const agent = catalog.find((a) => a.id === id);
      if (agent?.core) return;
      persist(installedIds.filter((x) => x !== id));
    },
    [installedIds, persist, catalog],
  );

  const installed = useMemo(() => new Set(installedIds), [installedIds]);

  const value = useMemo(
    () => ({
      catalog,
      installed,
      install,
      uninstall,
      isInstalled: (id: string) => installed.has(id),
    }),
    [catalog, installed, install, uninstall],
  );

  return (
    <InstalledAgentsContext.Provider value={value}>{children}</InstalledAgentsContext.Provider>
  );
}

export function useInstalledAgents() {
  const ctx = useContext(InstalledAgentsContext);
  if (!ctx) throw new Error('useInstalledAgents must be used within InstalledAgentsProvider');
  return ctx;
}

export function useInstalledNodeTypes(): Set<string> {
  const { catalog, installed } = useInstalledAgents();
  const types = new Set<string>();
  for (const agent of catalog) {
    if (agent.core || installed.has(agent.id)) {
      types.add(agent.nodeType);
    }
  }
  if (types.size === 0) types.add('llm');
  return types;
}
