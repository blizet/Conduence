import type { WorkflowNodeData } from '@/nodes/types';
import {
  accessHint,
  endpointRequiresKey,
  getToolCatalog,
  resolveDefaultEndpoint,
  toolRequiresApiKey,
} from '@/lib/tool-endpoints';

/** Show API key field when the tool has any private/premium endpoints. */
export function shouldShowToolApiKeyField(toolId: string): boolean {
  const catalog = getToolCatalog(toolId);
  if (!catalog) return false;
  return catalog.endpoints.some((e) => e.tier === 'private');
}

/** Node should show red border — missing required API key. */
export function isToolNodeMissingKey(toolId: string, data: WorkflowNodeData): boolean {
  if (!shouldShowToolApiKeyField(toolId)) return false;
  const apiKey = (data.apiKey ?? '').trim();
  if (apiKey) return false;
  return toolRequiresApiKey(toolId);
}

export { accessHint };
