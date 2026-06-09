import type { Node } from '@xyflow/react';

export type NodeCategory = 'tool' | 'mindagent';

export type WorkflowNodeData = {
  label: string;
  description?: string;
  category: NodeCategory;
  accent: string;
  apiKey?: string;
  systemPrompt?: string;
  userPrompt?: string;
  model?: string;
  temperature?: string;
  maxTokens?: string;
  newsPollLimit?: string;
  newsFilterCategories?: string[];
};

export type WorkflowNode = Node<WorkflowNodeData>;

export type PaletteItem = {
  type: string;
  label: string;
  description: string;
  category: NodeCategory;
  accent: string;
};

export type HandleConfig = {
  type: 'source' | 'target';
  position: 'left' | 'right' | 'top' | 'bottom';
  id?: string;
  label?: string;
  style?: React.CSSProperties;
};

export const MARKET_CATEGORIES = [
  'Crypto',
  'Finance',
  'Economics',
  'Politics',
  'Entertainment',
  'Weather',
] as const;

export type MarketCategory = (typeof MARKET_CATEGORIES)[number];

export const LLM_INPUT_COUNT = 4;
export const LLM_OUTPUT_COUNT = 3;
