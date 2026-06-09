import type { NodeTypes } from '@xyflow/react';
import type { PaletteItem } from './types';
import { LlmNode } from './mindagents/LlmNode';
import { NewsAgentNode } from './mindagents/NewsAgentNode';
import { ConditionNode } from './tools/ConditionNode';
import { EndNode } from './tools/EndNode';
import { OutputNode } from './tools/OutputNode';
import { StartNode } from './tools/StartNode';
import { TransformNode } from './tools/TransformNode';

export const nodeTypes: NodeTypes = {
  start: StartNode,
  end: EndNode,
  condition: ConditionNode,
  transform: TransformNode,
  output: OutputNode,
  llm: LlmNode,
  newsAgent: NewsAgentNode,
};

export const PALETTE_ITEMS: PaletteItem[] = [
  {
    type: 'start',
    label: 'Start',
    description: 'Workflow entry point',
    category: 'tool',
    accent: '#4ade80',
  },
  {
    type: 'end',
    label: 'End',
    description: 'Workflow termination',
    category: 'tool',
    accent: '#f87171',
  },
  {
    type: 'condition',
    label: 'Condition',
    description: 'Branch on true / false',
    category: 'tool',
    accent: '#fbbf24',
  },
  {
    type: 'transform',
    label: 'Transform',
    description: 'Map or reshape data',
    category: 'tool',
    accent: '#22d3ee',
  },
  {
    type: 'output',
    label: 'Output',
    description: 'Emit workflow result',
    category: 'tool',
    accent: '#60a5fa',
  },
  {
    type: 'newsAgent',
    label: 'News Agent',
    description: 'CoinDesk news — autonomous mind agent',
    category: 'mindagent',
    accent: '#fb923c',
  },
  {
    type: 'llm',
    label: 'LLM Analyzer',
    description: 'Main analyzer — prompts + multi I/O',
    category: 'mindagent',
    accent: '#f472b6',
  },
];

export function getPaletteItem(type: string): PaletteItem | undefined {
  return PALETTE_ITEMS.find((item) => item.type === type);
}
