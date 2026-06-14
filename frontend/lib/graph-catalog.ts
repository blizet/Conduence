'use client';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type ContextGraphSpec = {
  id: string;
  label?: string;
  description?: string;
  source?: string;
  graph_id?: string | null;
  node_count?: number;
  edge_count?: number;
};

export function userSlugFromGraphId(graphId: string | undefined): string {
  if (!graphId?.trim()) return '';
  const dot = graphId.indexOf('.');
  return dot > 0 ? graphId.slice(0, dot) : graphId;
}

export function filterGraphsForUser(allGraphs: string[], userSlug: string): string[] {
  if (!userSlug.trim()) return allGraphs;
  const needle = userSlug.toLowerCase();
  return allGraphs.filter((g) => g.toLowerCase().includes(needle));
}

export async function fetchContextGraphs(): Promise<ContextGraphSpec[]> {
  try {
    const res = await fetch(`${API}/api/orchestrator/context-graphs`, { cache: 'no-store' });
    if (!res.ok) return [];
    const body = (await res.json()) as { graphs?: ContextGraphSpec[] };
    return body.graphs ?? [];
  } catch {
    return [];
  }
}

export async function fetchFalkorGraphIds(): Promise<string[]> {
  try {
    const res = await fetch(`${API}/api/graphs`, { cache: 'no-store' });
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body) ? body : [];
  } catch {
    return [];
  }
}

export type MemorySignalPreview = {
  agent?: string;
  type?: string;
  headline?: string;
  thesis?: string;
  summary?: string;
  direction?: string;
  ts?: string;
};

export type OrchestratorMemoryStatus = {
  memorySize?: number;
  recentSignals?: MemorySignalPreview[];
  processed?: number;
  running?: boolean;
};

export async function fetchOrchestratorMemory(): Promise<OrchestratorMemoryStatus> {
  try {
    const res = await fetch(`${API}/api/orchestrator/status`, { cache: 'no-store' });
    if (!res.ok) return {};
    return (await res.json()) as OrchestratorMemoryStatus;
  } catch {
    return {};
  }
}
