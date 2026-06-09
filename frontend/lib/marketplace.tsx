'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type MarketplaceAgent = {
  id: string;
  nodeType: string;
  name: string;
  description: string;
  autonomous: boolean;
  accent: string;
  core?: boolean;
  feedTopic?: string;
};

const STORAGE_KEY = 'cot-installed-mind-agents';
const DEFAULT_INSTALLED = ['llm'];

export const MARKETPLACE_CATALOG: MarketplaceAgent[] = [
  {
    id: 'llm',
    nodeType: 'llm',
    name: 'LLM Analyzer',
    description: 'Main inference — synthesizes feeds into trade decisions',
    autonomous: false,
    accent: '#f472b6',
    core: true,
  },
  {
    id: 'newsAgent',
    nodeType: 'newsAgent',
    name: 'News Agent',
    description: 'Autonomous CoinDesk feed → Redpanda topic agent.feeds.newsAgent.public',
    autonomous: true,
    accent: '#fb923c',
    feedTopic: 'agent.feeds.newsAgent.public',
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

export function InstalledAgentsProvider({ children }: { children: React.ReactNode }) {
  const [installedIds, setInstalledIds] = useState<string[]>(DEFAULT_INSTALLED);

  useEffect(() => {
    setInstalledIds(loadInstalled());
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
      const agent = MARKETPLACE_CATALOG.find((a) => a.id === id);
      if (agent?.core) return;
      persist(installedIds.filter((x) => x !== id));
    },
    [installedIds, persist],
  );

  const installed = useMemo(() => new Set(installedIds), [installedIds]);

  const value = useMemo(
    () => ({
      catalog: MARKETPLACE_CATALOG,
      installed,
      install,
      uninstall,
      isInstalled: (id: string) => installed.has(id),
    }),
    [installed, install, uninstall],
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
