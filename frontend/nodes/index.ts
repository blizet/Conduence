import type { NodeTypes } from '@xyflow/react';
import type { PaletteItem } from './types';
import { LlmNode } from './mindagents/LlmNode';
import { NewsAgentNode } from './mindagents/NewsAgentNode';
import { WhaleWalletNode } from './subagents/WhaleWalletNode';
import { ClobToolNode } from './tools/ClobToolNode';
import { ConditionNode } from './tools/ConditionNode';
import { CotBuilderNode } from './tools/CotBuilderNode';
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
  clob: ClobToolNode,
  cotBuilder: CotBuilderNode,
  llm: LlmNode,
  newsAgent: NewsAgentNode,
  whaleWallet: WhaleWalletNode,
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
    type: 'clob',
    label: 'CLOB',
    description: 'Polymarket orderbook quotes & trade execution',
    category: 'tool',
    accent: '#a78bfa',
  },
  {
    type: 'cotBuilder',
    label: 'CoT Builder',
    description: 'Format LLM decision + markets into graph JSON',
    category: 'tool',
    accent: '#34d399',
  },
  {
    type: 'whaleWallet',
    label: 'Whale Wallet',
    description: 'Track proxy wallets against news & markets',
    category: 'subagent',
    accent: '#38bdf8',
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
