'use client';

import type { Edge } from '@xyflow/react';
import type { WorkflowNode, WorkflowNodeData } from '@/nodes/types';
import {
  EXECUTION_TOOL_TYPES,
  resolveAgentTradePayload,
  runExecutionToolFromAgent,
  upstreamAgentForExecutionTool,
} from './execution-tools';
import { RUNNABLE_TOOL_TYPES, executeToolNode, toolResultPatch } from './workflow-tools';
import { downstreamNodes, findLlmNode, runOrchestrator } from './orchestrator-runner';

type NodePatchFn = (nodeId: string, patch: Partial<WorkflowNodeData>) => void;

export function formatOutputPayload(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildAdjacency(edges: Edge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    const list = map.get(edge.source) ?? [];
    list.push(edge.target);
    map.set(edge.source, list);
  }
  return map;
}

function buildIncoming(edges: Edge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    const list = map.get(edge.target) ?? [];
    list.push(edge.source);
    map.set(edge.target, list);
  }
  return map;
}

function isOutputNodeType(type: string | undefined): boolean {
  return type === 'workflowOutput' || type === 'output';
}

function outputNodeIds(nodes: WorkflowNode[]): Set<string> {
  return new Set(nodes.filter((n) => isOutputNodeType(n.type)).map((n) => n.id));
}

function runnableNodes(nodes: WorkflowNode[]): Map<string, WorkflowNode> {
  const map = new Map<string, WorkflowNode>();
  for (const node of nodes) {
    if (node.type && RUNNABLE_TOOL_TYPES.has(node.type)) {
      map.set(node.id, node);
    }
  }
  return map;
}

function runnableUpstreamOfOutputs(nodes: WorkflowNode[], edges: Edge[]): Set<string> {
  const outputs = outputNodeIds(nodes);
  const incoming = buildIncoming(edges);
  const runnable = runnableNodes(nodes);
  const visited = new Set<string>();
  const queue = [...outputs];
  const selected = new Set<string>();

  while (queue.length > 0) {
    const nodeId = queue.shift() as string;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    const parents = incoming.get(nodeId) ?? [];
    for (const parent of parents) {
      if (runnable.has(parent)) selected.add(parent);
      queue.push(parent);
    }
  }

  if (selected.size > 0) return selected;
  return new Set(runnable.keys());
}

function topologicalRunnableOrder(
  candidateIds: Set<string>,
  nodes: WorkflowNode[],
  edges: Edge[],
): string[] {
  const runnable = runnableNodes(nodes);
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const id of candidateIds) indegree.set(id, 0);
  for (const edge of edges) {
    if (!candidateIds.has(edge.source) || !candidateIds.has(edge.target)) continue;
    if (!runnable.has(edge.source) || !runnable.has(edge.target)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge.target);
    outgoing.set(edge.source, list);
  }

  const queue = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id);
  const order: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift() as string;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 1) - 1);
      if ((indegree.get(next) ?? 0) === 0) {
        queue.push(next);
      }
    }
  }

  if (order.length < candidateIds.size) {
    for (const id of candidateIds) {
      if (!order.includes(id)) order.push(id);
    }
  }

  return order;
}

function downstreamOutputIds(
  sourceId: string,
  nodes: WorkflowNode[],
  edges: Edge[],
): string[] {
  const outputs = outputNodeIds(nodes);
  const adjacency = buildAdjacency(edges);
  const queue = [sourceId];
  const visited = new Set<string>();
  const found = new Set<string>();

  while (queue.length > 0) {
    const nodeId = queue.shift() as string;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      if (outputs.has(next)) {
        found.add(next);
      } else {
        queue.push(next);
      }
    }
  }

  return [...found];
}

export async function runWorkflow({
  nodes,
  edges,
  patchNode,
  feedSignals,
}: {
  nodes: WorkflowNode[];
  edges: Edge[];
  patchNode: NodePatchFn;
  feedSignals?: Record<string, { latest?: unknown }>;
}): Promise<void> {
  const candidateIds = runnableUpstreamOfOutputs(nodes, edges);
  const order = topologicalRunnableOrder(candidateIds, nodes, edges);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  for (const node of nodes) {
    if (isOutputNodeType(node.type)) {
      patchNode(node.id, {
        outputStatus: '',
        outputPayload: '',
        outputSource: '',
        outputDurationMs: undefined,
        outputLlmUsage: undefined,
        outputLangsmith: undefined,
      });
    }
    if (node.type && RUNNABLE_TOOL_TYPES.has(node.type)) {
      patchNode(node.id, {
        workflowStatus: 'idle',
        workflowError: '',
        workflowResult: '',
        workflowDurationMs: undefined,
      });
    }
    if (node.type && EXECUTION_TOOL_TYPES.has(node.type)) {
      patchNode(node.id, {
        workflowStatus: 'idle',
        workflowError: '',
        workflowResult: '',
        workflowDurationMs: undefined,
      });
    }
  }

  for (const nodeId of order) {
    const node = nodeById.get(nodeId);
    if (!node || !node.type || !RUNNABLE_TOOL_TYPES.has(node.type)) continue;

    patchNode(nodeId, {
      workflowStatus: 'running',
      workflowError: '',
      workflowResult: '',
      workflowDurationMs: undefined,
    });
    let result;
    try {
      result = await executeToolNode(node.type, node.data);
    } catch (err) {
      result = {
        ok: false,
        source: node.type,
        request: {},
        error: err instanceof Error ? err.message : 'Execution failed',
      };
    }

    patchNode(nodeId, toolResultPatch(result));

    const outputs = downstreamOutputIds(nodeId, nodes, edges);
    const outputPayload = formatOutputPayload(result);
    for (const outputId of outputs) {
      patchNode(outputId, {
        outputStatus: result.ok ? 'success' : 'error',
        outputPayload,
        outputSource: result.source,
        outputDurationMs: result.durationMs,
      });
    }

    if (!result.ok) {
      break;
    }
  }

  const llmNode = findLlmNode(nodes);
  let orch: Awaited<ReturnType<typeof runOrchestrator>> = { ok: false };

  if (llmNode) {
    patchNode(llmNode.id, {
      workflowStatus: 'running',
      workflowError: '',
      workflowResult: '',
      workflowDurationMs: undefined,
    });
    orch = await runOrchestrator({
      nodes,
      edges,
      feedSignals,
      backendUrl: llmNode.data.backendUrl,
    });

    patchNode(llmNode.id, {
      workflowStatus: orch.ok ? 'success' : 'error',
      workflowError: orch.error ?? (orch.errors ?? []).join('; '),
      workflowResult: JSON.stringify(orch, null, 2),
      workflowDurationMs: orch.durationMs,
      decisionJson: orch.decision ? JSON.stringify(orch.decision, null, 2) : undefined,
      correlatedJson: orch.correlated ? JSON.stringify(orch.correlated, null, 2) : undefined,
    });

    for (const cotNode of downstreamNodes(llmNode.id, nodes, edges, 'cotBuilder')) {
      patchNode(cotNode.id, {
        decisionJson: orch.decision ? JSON.stringify(orch.decision, null, 2) : cotNode.data.decisionJson,
        correlatedJson: orch.correlated
          ? JSON.stringify(orch.correlated, null, 2)
          : cotNode.data.correlatedJson,
        cotOutput: orch.cot ? JSON.stringify(orch.cot, null, 2) : '',
        cotStatus: orch.cot ? 'success' : orch.ok ? 'skipped' : 'error',
      });
    }

    for (const outNode of downstreamNodes(llmNode.id, nodes, edges, 'workflowOutput')) {
      patchNode(outNode.id, {
        outputStatus: orch.ok ? 'success' : 'error',
        outputPayload: formatOutputPayload(orch),
        outputSource: 'llm',
        outputDurationMs: orch.durationMs,
        outputLlmUsage: orch.llm_usage,
        outputLangsmith: orch.langsmith,
      });
    }
  }

  await runWiredExecutionTools({ nodes, edges, patchNode, orch, feedSignals });
}

async function runWiredExecutionTools({
  nodes,
  edges,
  patchNode,
  orch,
  feedSignals,
}: {
  nodes: WorkflowNode[];
  edges: Edge[];
  patchNode: NodePatchFn;
  orch: Awaited<ReturnType<typeof runOrchestrator>>;
  feedSignals?: Record<string, { latest?: unknown }>;
}): Promise<void> {
  for (const node of nodes) {
    if (!node.type || !EXECUTION_TOOL_TYPES.has(node.type)) continue;

    const source = upstreamAgentForExecutionTool(node.id, nodes, edges);
    if (!source) continue;

    const payload = resolveAgentTradePayload(source, orch, feedSignals);
    if (!payload) continue;

    patchNode(node.id, {
      workflowStatus: 'running',
      workflowError: '',
      workflowResult: '',
      workflowDurationMs: undefined,
    });

    let result;
    try {
      result = await runExecutionToolFromAgent(
        node.type as 'clob' | 'kalshi' | 'telegram' | 'paperTrading',
        node.data,
        payload,
        node.data.backendUrl,
      );
    } catch (err) {
      result = {
        ok: false,
        source: node.type,
        request: {},
        error: err instanceof Error ? err.message : 'Execution failed',
      };
    }

    patchNode(node.id, toolResultPatch(result));
    if (!result.ok) break;
  }
}
