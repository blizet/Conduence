'use client';

import type { Edge } from '@xyflow/react';
import type { WorkflowNode } from '@/nodes/types';
import { normalizeWorkflowCanvas } from '@/lib/dnd';

const WORKFLOWS_KEY = 'cot-playground-workflows';
const ACTIVE_ID_KEY = 'cot-playground-active-workflow-id';

export type SavedWorkflow = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  canvas: { nodes: WorkflowNode[]; edges: Edge[] };
};

function uid(): string {
  return `wf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function loadSavedWorkflows(): SavedWorkflow[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WORKFLOWS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedWorkflow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSavedWorkflows(workflows: SavedWorkflow[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(workflows));
}

export function getActiveWorkflowId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_ID_KEY);
}

export function setActiveWorkflowId(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACTIVE_ID_KEY, id);
}

export function createSavedWorkflow(name = 'Workflow'): SavedWorkflow {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    canvas: { nodes: [], edges: [] },
  };
}

export function ensureDefaultWorkflows(): { workflows: SavedWorkflow[]; activeId: string } {
  let workflows = loadSavedWorkflows();
  let activeId = getActiveWorkflowId();

  if (workflows.length === 0) {
    const wf = createSavedWorkflow();
    workflows = [wf];
    saveSavedWorkflows(workflows);
    activeId = wf.id;
    setActiveWorkflowId(activeId);
  } else if (!activeId || !workflows.some((w) => w.id === activeId)) {
    activeId = workflows[0].id;
    setActiveWorkflowId(activeId);
  }

  return { workflows, activeId: activeId! };
}

export function upsertWorkflowCanvas(
  id: string,
  canvas: { nodes: WorkflowNode[]; edges: Edge[] },
  options?: { allowEmpty?: boolean },
): SavedWorkflow[] {
  const workflows = loadSavedWorkflows();
  const now = new Date().toISOString();
  const idx = workflows.findIndex((w) => w.id === id);
  if (idx === -1) return workflows;

  const isEmpty = canvas.nodes.length === 0 && canvas.edges.length === 0;
  const existing = workflows[idx].canvas;
  const hadContent = existing.nodes.length > 0 || existing.edges.length > 0;
  if (isEmpty && hadContent && !options?.allowEmpty) {
    return workflows;
  }

  const normalized = normalizeWorkflowCanvas(canvas.nodes, canvas.edges);
  workflows[idx] = { ...workflows[idx], canvas: normalized, updatedAt: now };
  saveSavedWorkflows(workflows);
  return workflows;
}

export function renameWorkflow(id: string, name: string): SavedWorkflow[] {
  const trimmed = name.trim() || 'Workflow';
  const workflows = loadSavedWorkflows();
  const idx = workflows.findIndex((w) => w.id === id);
  if (idx === -1) return workflows;
  workflows[idx] = {
    ...workflows[idx],
    name: trimmed,
    updatedAt: new Date().toISOString(),
  };
  saveSavedWorkflows(workflows);
  return workflows;
}

export function addSavedWorkflow(name?: string): { workflows: SavedWorkflow[]; workflow: SavedWorkflow } {
  const workflow = createSavedWorkflow(name);
  const workflows = [...loadSavedWorkflows(), workflow];
  saveSavedWorkflows(workflows);
  setActiveWorkflowId(workflow.id);
  return { workflows, workflow };
}

export function deleteSavedWorkflow(id: string): { workflows: SavedWorkflow[]; activeId: string } {
  let workflows = loadSavedWorkflows().filter((w) => w.id !== id);
  if (workflows.length === 0) {
    const wf = createSavedWorkflow();
    workflows = [wf];
  }
  let activeId = getActiveWorkflowId();
  if (!activeId || activeId === id || !workflows.some((w) => w.id === activeId)) {
    activeId = workflows[0].id;
    setActiveWorkflowId(activeId);
  }
  saveSavedWorkflows(workflows);
  return { workflows, activeId: activeId! };
}

export function getWorkflowById(id: string): SavedWorkflow | undefined {
  return loadSavedWorkflows().find((w) => w.id === id);
}
