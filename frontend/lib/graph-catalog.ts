'use client';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
