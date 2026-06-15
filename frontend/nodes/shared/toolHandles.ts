import type { HandleConfig } from '../types';

/** Catalog tool — single Output port (top) into orchestrator or sub-agent Tools. */
export function standardToolHandles(extra: HandleConfig[] = []): HandleConfig[] {
  return [{ type: 'source', position: 'top', id: 'out', label: 'Output' }, ...extra];
}

/** Execution sink — agent output connects to Input only. */
export function executionToolHandles(): HandleConfig[] {
  return [{ type: 'target', position: 'left', id: 'in', label: 'Input' }];
}
