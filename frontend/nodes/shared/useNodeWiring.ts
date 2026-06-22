'use client';

import { useEdges, useNodes } from '@xyflow/react';
import { useMemo } from 'react';
import {
  partitionWiredInputs,
  wiredInputsForNode,
  type WiredInput,
} from '@/lib/node-wiring';
import type { WorkflowNode } from '../types';

export function useNodeWiring(nodeId: string) {
  const nodes = useNodes() as WorkflowNode[];
  const edges = useEdges();

  const inputs = useMemo(
    () => wiredInputsForNode(nodeId, nodes, edges),
    [nodeId, nodes, edges],
  );

  const { tools, other } = useMemo(() => partitionWiredInputs(inputs), [inputs]);

  return { inputs, tools, other } satisfies {
    inputs: WiredInput[];
    tools: WiredInput[];
    other: WiredInput[];
  };
}
