'use client';

import type { Edge } from '@xyflow/react';
import type { WorkflowNode } from '@/nodes/types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type MarketplaceWorkflowListing = {
  id: string;
  name: string;
  description?: string;
  publisher?: string;
  publishedAt?: string;
  updatedAt?: string;
  nodeCount?: number;
  edgeCount?: number;
};

export type MarketplaceWorkflow = MarketplaceWorkflowListing & {
  canvas: {
    nodes: WorkflowNode[];
    edges: Edge[];
  };
};

export async function fetchMarketplaceWorkflows(): Promise<MarketplaceWorkflowListing[]> {
  const res = await fetch(`${API_URL}/api/marketplace/workflows`, { cache: 'no-store' });
  if (!res.ok) return [];
  const body = (await res.json()) as { workflows?: MarketplaceWorkflowListing[] };
  return body.workflows ?? [];
}

export async function fetchMarketplaceWorkflow(id: string): Promise<MarketplaceWorkflow | null> {
  const res = await fetch(`${API_URL}/api/marketplace/workflows/${encodeURIComponent(id)}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as MarketplaceWorkflow;
}

export async function publishWorkflowToMarketplace(payload: {
  name: string;
  description?: string;
  publisher?: string;
  canvas: { nodes: WorkflowNode[]; edges: Edge[] };
}): Promise<{ ok: boolean; error?: string; workflow?: MarketplaceWorkflowListing }> {
  const res = await fetch(`${API_URL}/api/marketplace/workflows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    error?: string;
    detail?: string;
    workflow?: MarketplaceWorkflowListing;
  };
  if (!res.ok) {
    return { ok: false, error: body.detail ?? body.error ?? `Publish failed (${res.status})` };
  }
  return { ok: true, workflow: body.workflow };
}

export async function deleteMarketplaceWorkflow(id: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/marketplace/workflows/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return res.ok;
}

/** Strip secrets before sending canvas to the marketplace. */
export function sanitizeCanvasForPublish(canvas: {
  nodes: WorkflowNode[];
  edges: Edge[];
}): { nodes: WorkflowNode[]; edges: Edge[] } {
  const secretKeys = new Set(['apiKey', 'apiSecret', 'apiPassphrase', 'llmApiKey']);
  return {
    nodes: canvas.nodes.map((node) => ({
      ...node,
      data: Object.fromEntries(
        Object.entries(node.data).map(([key, value]) =>
          secretKeys.has(key) ? [key, ''] : [key, value],
        ),
      ) as WorkflowNode['data'],
    })),
    edges: canvas.edges,
  };
}
