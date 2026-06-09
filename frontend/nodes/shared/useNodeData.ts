'use client';

import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { WorkflowNode, WorkflowNodeData } from '../types';

export function useNodeData(nodeId: string) {
  const { setNodes } = useReactFlow();

  const updateData = useCallback(
    (patch: Partial<WorkflowNodeData>) => {
      setNodes((nodes) =>
        nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n,
        ) as WorkflowNode[],
      );
    },
    [nodeId, setNodes],
  );

  return updateData;
}

export function stopNodeKeyPropagation(event: React.KeyboardEvent) {
  event.stopPropagation();
}
