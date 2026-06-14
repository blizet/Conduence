'use client';

import type { Edge } from '@xyflow/react';
import type { WorkflowNode } from '@/nodes/types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type WorkflowLiveStatus = {
  ok?: boolean;
  running?: boolean;
  workflow_id?: string;
  started_subagents?: string[];
  has_orchestrator?: boolean;
  error?: string;
};

function canvasPayload(nodes: WorkflowNode[], edges: Edge[]) {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.type, data: n.data })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    })),
  };
}

export async function startWorkflowLive({
  nodes,
  edges,
  config,
}: {
  nodes: WorkflowNode[];
  edges: Edge[];
  config?: Record<string, unknown>;
}): Promise<WorkflowLiveStatus> {
  try {
    const res = await fetch(`${API}/api/orchestrator/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        canvas: canvasPayload(nodes, edges),
        config: config ?? {},
      }),
    });
    const body = (await res.json()) as WorkflowLiveStatus & { error?: string };
    if (!res.ok) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    return { ...body, ok: body.ok ?? true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Go Live failed' };
  }
}

export async function stopWorkflowLive(): Promise<WorkflowLiveStatus> {
  try {
    const res = await fetch(`${API}/api/orchestrator/stop`, { method: 'POST' });
    const body = (await res.json()) as WorkflowLiveStatus;
    return { ...body, ok: body.ok ?? true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Stop failed' };
  }
}

export async function fetchWorkflowLiveStatus(): Promise<WorkflowLiveStatus> {
  try {
    const res = await fetch(`${API}/api/orchestrator/workflow/status`, { cache: 'no-store' });
    if (!res.ok) return { ok: false, running: false };
    return (await res.json()) as WorkflowLiveStatus;
  } catch {
    return { ok: false, running: false };
  }
}
