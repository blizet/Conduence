'use client';

import type { Edge } from '@xyflow/react';
import type { WorkflowNode, WorkflowNodeData } from '@/nodes/types';
import { RUNNABLE_TOOL_TYPES, executeToolNode } from './workflow-tools';

type NodePatchFn = (nodeId: string, patch: Partial<WorkflowNodeData>) => void;

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
}: {
  nodes: WorkflowNode[];
  edges: Edge[];
  patchNode: NodePatchFn;
}): Promise<void> {
  const candidateIds = runnableUpstreamOfOutputs(nodes, edges);
  const order = topologicalRunnableOrder(candidateIds, nodes, edges);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  for (const node of nodes) {
    if (isOutputNodeType(node.type)) {
      patchNode(node.id, { outputStatus: '', outputPayload: '', outputSource: '' });
    }
    if (node.type && RUNNABLE_TOOL_TYPES.has(node.type)) {
      patchNode(node.id, { workflowStatus: 'idle', workflowError: '', workflowResult: '' });
    }
  }

  for (const nodeId of order) {
    const node = nodeById.get(nodeId);
    if (!node || !node.type || !RUNNABLE_TOOL_TYPES.has(node.type)) continue;

    patchNode(nodeId, { workflowStatus: 'running', workflowError: '', workflowResult: '' });
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

    patchNode(nodeId, {
      workflowStatus: result.ok ? 'success' : 'error',
      workflowError: result.error ?? '',
      workflowResult: JSON.stringify(result, null, 2),
    });

    const outputs = downstreamOutputIds(nodeId, nodes, edges);
    const outputPayload = JSON.stringify(result, null, 2);
    for (const outputId of outputs) {
      patchNode(outputId, {
        outputStatus: result.ok ? 'success' : 'error',
        outputPayload,
        outputSource: result.source,
      });
    }

    if (!result.ok) {
      break;
    }
  }
}
