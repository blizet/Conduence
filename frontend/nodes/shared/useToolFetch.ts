'use client';

import { useCallback, useState } from 'react';
import {
  clearFetchState,
  executeToolNode,
  toolResultPatch,
  type RunnableToolType,
} from '@/lib/workflow-tools';
import type { WorkflowNodeData } from '../types';

export function useToolFetch(
  toolType: RunnableToolType,
  data: WorkflowNodeData,
  updateData: (patch: Partial<WorkflowNodeData>) => void,
) {
  const [busy, setBusy] = useState(false);

  const runFetch = useCallback(async () => {
    setBusy(true);
    updateData(clearFetchState());
    try {
      const result = await executeToolNode(toolType, data);
      updateData(toolResultPatch(result));
    } catch (err) {
      updateData({
        workflowStatus: 'error',
        workflowError: err instanceof Error ? err.message : 'Request failed',
        workflowResult: '',
        workflowDurationMs: undefined,
      });
    } finally {
      setBusy(false);
    }
  }, [data, toolType, updateData]);

  return { busy, runFetch };
}
