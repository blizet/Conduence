import type { PaletteItem, WorkflowNodeData } from '@/nodes/types';
import {
  DEFAULT_LLM_SYSTEM_PROMPT,
  DEFAULT_LLM_USER_PROMPT,
} from '@/nodes/constants';

let nodeId = 0;

export function getNodeId(): string {
  nodeId += 1;
  return `node_${nodeId}`;
}

const DEFAULTS: Partial<Record<string, Partial<WorkflowNodeData>>> = {
  llm: {
    apiKey: '',
    model: 'gemini-2.0-flash',
    temperature: '0.7',
    maxTokens: '2048',
    systemPrompt: DEFAULT_LLM_SYSTEM_PROMPT,
    userPrompt: DEFAULT_LLM_USER_PROMPT,
    newsFilterCategories: [],
  },
  newsAgent: { apiKey: '', newsPollLimit: '20' },
};

export function createNodeData(item: PaletteItem): WorkflowNodeData {
  return {
    label: item.label,
    description: item.description,
    category: item.category,
    accent: item.accent,
    ...DEFAULTS[item.type],
  };
}

export const DND_TYPE = 'application/reactflow';
