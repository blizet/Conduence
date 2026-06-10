import type { NodeTypes } from '@xyflow/react';
import type { PaletteItem } from './types';
import { LlmNode } from './mindagents/LlmNode';
import { NewsAgentNode } from './mindagents/NewsAgentNode';
import { WhaleWalletNode } from './subagents/WhaleWalletNode';
import { ClobToolNode } from './tools/ClobToolNode';
import { CoinMarketCapNode } from './tools/CoinMarketCapNode';
import { ConditionNode } from './tools/ConditionNode';
import { CotBuilderNode } from './tools/CotBuilderNode';
import { CryptoNewsNode } from './tools/CryptoNewsNode';
import { CryptoQuantNode } from './tools/CryptoQuantNode';
import { DefiLlamaNode } from './tools/DefiLlamaNode';
import { EndNode } from './tools/EndNode';
import { OutputNode } from './tools/OutputNode';
import { StartNode } from './tools/StartNode';
import { TavilyNode } from './tools/TavilyNode';
import { TransformNode } from './tools/TransformNode';

export const nodeTypes: NodeTypes = {
  start: StartNode,
  end: EndNode,
  condition: ConditionNode,
  transform: TransformNode,
  workflowOutput: OutputNode,
  output: OutputNode,
  clob: ClobToolNode,
  cotBuilder: CotBuilderNode,
  coinmarketcap: CoinMarketCapNode,
  defillama: DefiLlamaNode,
  cryptonews: CryptoNewsNode,
  cryptoquant: CryptoQuantNode,
  tavily: TavilyNode,
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
    type: 'workflowOutput',
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
    type: 'coinmarketcap',
    label: 'CoinMarketCap',
    description: 'Fetch crypto quotes from CoinMarketCap',
    category: 'tool',
    accent: '#facc15',
  },
  {
    type: 'defillama',
    label: 'DefiLlama',
    description: 'Free TVL endpoints (no key); optional Pro API key for paid endpoints',
    category: 'tool',
    accent: '#22c55e',
  },
  {
    type: 'cryptonews',
    label: 'CryptoNews API',
    description: 'Fetch filtered crypto headlines and sentiment',
    category: 'tool',
    accent: '#60a5fa',
  },
  {
    type: 'cryptoquant',
    label: 'CryptoQuant',
    description: 'Fetch on-chain and exchange metrics',
    category: 'tool',
    accent: '#a855f7',
  },
  {
    type: 'tavily',
    label: 'Tavily',
    description: 'Web search and extraction for agent context',
    category: 'tool',
    accent: '#fb7185',
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
