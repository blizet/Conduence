import type { NodeTypes } from '@xyflow/react';
import type { PaletteItem, PaletteToolGroup } from './types';
import { LlmNode } from './mindagents/LlmNode';
import { SportsScannerNode } from './mindagents/SportsScannerNode';
import { ArbitrageAgentNode } from './subagents/ArbitrageAgentNode';
import { NewsAgentNode } from './subagents/NewsAgentNode';
import { ClobToolNode } from './tools/ClobToolNode';
import { CoinGeckoNode } from './tools/CoinGeckoNode';
import { CoinMarketCapNode } from './tools/CoinMarketCapNode';
import { ConditionNode } from './tools/ConditionNode';
import { CotBuilderNode } from './tools/CotBuilderNode';
import { CryptoNewsNode } from './tools/CryptoNewsNode';
import { CryptoQuantNode } from './tools/CryptoQuantNode';
import { DefiLlamaNode } from './tools/DefiLlamaNode';
import { EndNode } from './tools/EndNode';
import { KalshiToolNode } from './tools/KalshiToolNode';
import { OutputNode } from './tools/OutputNode';
import { PolymarketGammaNode } from './tools/PolymarketGammaNode';
import { PolymarketWalletNode } from './tools/PolymarketWalletNode';
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
  kalshi: KalshiToolNode,
  cotBuilder: CotBuilderNode,
  coinmarketcap: CoinMarketCapNode,
  defillama: DefiLlamaNode,
  cryptonews: CryptoNewsNode,
  cryptoquant: CryptoQuantNode,
  tavily: TavilyNode,
  coingecko: CoinGeckoNode,
  polymarketGamma: PolymarketGammaNode,
  polymarketWallet: PolymarketWalletNode,
  llm: LlmNode,
  newsAgent: NewsAgentNode,
  arbitrageAgent: ArbitrageAgentNode,
  sportsScanner: SportsScannerNode,
};

const FLOW_TOOL_TYPES = new Set(['start', 'end', 'condition', 'transform', 'workflowOutput']);

export const PALETTE_TOOL_GROUPS: { id: PaletteToolGroup; title: string }[] = [
  { id: 'venues', title: 'Prediction Markets' },
  { id: 'market-data', title: 'Market Data' },
  { id: 'helpers', title: 'Agent Helpers' },
  { id: 'workflow', title: 'Workflow' },
];

export const PALETTE_ITEMS: PaletteItem[] = [
  {
    type: 'llm',
    label: 'Orchestrator',
    description: 'Main agent — prompts + multi I/O',
    category: 'orchestrator',
    accent: '#f472b6',
  },
  {
    type: 'newsAgent',
    label: 'News Agent',
    description: 'CoinDesk news feed — snap CryptoNews + Tavily tools',
    category: 'subagent',
    accent: '#fb923c',
  },
  {
    type: 'arbitrageAgent',
    label: 'Arbitrage Agent',
    description: 'Polymarket × Kalshi arb scanner — snap venue tools',
    category: 'subagent',
    accent: '#c084fc',
  },
  {
    type: 'sportsScanner',
    label: 'Kalshi Sports Scanner',
    description: 'External late-game soccer feed — publisher runs kalshiSports + HTTP wrapper',
    category: 'subagent',
    accent: '#4ade80',
    requiresInstall: true,
  },
  {
    type: 'polymarketGamma',
    label: 'Polymarket Markets',
    description: 'Keyword search of open markets, ranked by quality score',
    category: 'tool',
    accent: '#818cf8',
    toolGroup: 'helpers',
  },
  {
    type: 'clob',
    label: 'Polymarket',
    description: 'Polymarket orderbook quotes & trade execution',
    category: 'tool',
    accent: '#a78bfa',
    toolGroup: 'venues',
  },
  {
    type: 'kalshi',
    label: 'Kalshi',
    description: 'Kalshi orderbook quotes & trade execution',
    category: 'tool',
    accent: '#2dd4bf',
    toolGroup: 'venues',
  },
  {
    type: 'coinmarketcap',
    label: 'CoinMarketCap',
    description: 'Fetch crypto quotes from CoinMarketCap',
    category: 'tool',
    accent: '#facc15',
    toolGroup: 'market-data',
  },
  {
    type: 'defillama',
    label: 'DefiLlama',
    description: 'Free TVL endpoints (no key); optional Pro API key for paid endpoints',
    category: 'tool',
    accent: '#22c55e',
    toolGroup: 'market-data',
  },
  {
    type: 'coingecko',
    label: 'CoinGecko',
    description: 'Spot price + 24h change — free API, no key',
    category: 'tool',
    accent: '#84cc16',
    toolGroup: 'market-data',
  },
  {
    type: 'cryptonews',
    label: 'CryptoNews API',
    description: 'Fetch filtered crypto headlines and sentiment',
    category: 'tool',
    accent: '#60a5fa',
    toolGroup: 'market-data',
  },
  {
    type: 'cryptoquant',
    label: 'CryptoQuant',
    description: 'Fetch on-chain and exchange metrics',
    category: 'tool',
    accent: '#a855f7',
    toolGroup: 'market-data',
  },
  {
    type: 'polymarketWallet',
    label: 'Polymarket Wallet',
    description: 'Recent trades / open positions of a wallet',
    category: 'tool',
    accent: '#2dd4bf',
    toolGroup: 'helpers',
  },
  {
    type: 'cotBuilder',
    label: 'CoT Builder',
    description: 'Format LLM decision + markets into graph JSON',
    category: 'tool',
    accent: '#34d399',
    toolGroup: 'helpers',
  },
  {
    type: 'tavily',
    label: 'Tavily',
    description: 'Web search and extraction for agent context',
    category: 'tool',
    accent: '#fb7185',
    toolGroup: 'helpers',
  },
  {
    type: 'start',
    label: 'Start',
    description: 'Workflow entry point',
    category: 'tool',
    accent: '#4ade80',
    toolGroup: 'workflow',
  },
  {
    type: 'end',
    label: 'End',
    description: 'Workflow termination',
    category: 'tool',
    accent: '#f87171',
    toolGroup: 'workflow',
  },
  {
    type: 'condition',
    label: 'Condition',
    description: 'Branch on true / false',
    category: 'tool',
    accent: '#fbbf24',
    toolGroup: 'workflow',
  },
  {
    type: 'transform',
    label: 'Transform',
    description: 'Map or reshape data',
    category: 'tool',
    accent: '#22d3ee',
    toolGroup: 'workflow',
  },
  {
    type: 'workflowOutput',
    label: 'Output',
    description: 'Emit workflow result',
    category: 'tool',
    accent: '#60a5fa',
    toolGroup: 'workflow',
  },
];

export function getPaletteItem(type: string): PaletteItem | undefined {
  return PALETTE_ITEMS.find((item) => item.type === type);
}

export function isFlowToolType(type: string): boolean {
  return FLOW_TOOL_TYPES.has(type);
}

export function getToolGroupItems(
  items: PaletteItem[],
  groupId: PaletteToolGroup,
): PaletteItem[] {
  return items.filter((item) => item.toolGroup === groupId);
}

export function getUngroupedToolItems(items: PaletteItem[]): PaletteItem[] {
  return items.filter((item) => item.category === 'tool' && !item.toolGroup);
}
