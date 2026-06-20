import type { NodeTypes } from '@xyflow/react';
import type { PaletteItem, PaletteToolGroup } from './types';
import { LlmNode } from './orchestrator/LlmNode';
import { ArbitrageAgentNode } from './subagents/ArbitrageAgentNode';
import { NewsAgentNode } from './subagents/NewsAgentNode';
import { RiskAnalyzerNode } from './subagents/RiskAnalyzerNode';
import { ClobToolNode } from './tools/ClobToolNode';
import { CoinGeckoNode } from './tools/CoinGeckoNode';
import { CoinMarketCapNode } from './tools/CoinMarketCapNode';
import { CryptoNewsNode } from './tools/CryptoNewsNode';
import { CryptoQuantNode } from './tools/CryptoQuantNode';
import { DefiLlamaNode } from './tools/DefiLlamaNode';
import { KalshiToolNode } from './tools/KalshiToolNode';
import { OutputNode } from './tools/OutputNode';
import { PaperTradingNode } from './tools/PaperTradingNode';
import { PolymarketGammaNode } from './tools/PolymarketGammaNode';
import { PolymarketWalletNode } from './tools/PolymarketWalletNode';
import { TavilyNode } from './tools/TavilyNode';
import { TelegramToolNode } from './tools/TelegramToolNode';
import { WalletMonitorNode } from './tools/WalletMonitorNode';
import { XMonitorNode } from './tools/XMonitorNode';

export const nodeTypes: NodeTypes = {
  workflowOutput: OutputNode,
  output: OutputNode,
  clob: ClobToolNode,
  kalshi: KalshiToolNode,
  paperTrading: PaperTradingNode,
  telegram: TelegramToolNode,
  coinmarketcap: CoinMarketCapNode,
  defillama: DefiLlamaNode,
  cryptonews: CryptoNewsNode,
  cryptoquant: CryptoQuantNode,
  tavily: TavilyNode,
  coingecko: CoinGeckoNode,
  polymarketGamma: PolymarketGammaNode,
  polymarketWallet: PolymarketWalletNode,
  xMonitor: XMonitorNode,
  walletMonitor: WalletMonitorNode,
  llm: LlmNode,
  newsAgent: NewsAgentNode,
  arbitrageAgent: ArbitrageAgentNode,
  riskAnalyzer: RiskAnalyzerNode,
};

export type PaletteGroupConfig = {
  id: PaletteToolGroup;
  title: string;
  headerVariant?: 'market-data' | 'helpers' | 'workflow' | 'execution';
};

export const PALETTE_TOOL_GROUPS: PaletteGroupConfig[] = [
  { id: 'market-data', title: 'Market Data', headerVariant: 'market-data' },
  { id: 'helpers', title: 'Agent Helpers', headerVariant: 'helpers' },
  { id: 'workflow', title: 'Workflow', headerVariant: 'workflow' },
];

export const EXECUTION_TOOL_GROUPS: PaletteGroupConfig[] = [
  { id: 'execution', title: 'Prediction Market', headerVariant: 'execution' },
  { id: 'socials', title: 'Socials', headerVariant: 'execution' },
];

export const PALETTE_ITEMS: PaletteItem[] = [
  {
    type: 'llm',
    label: 'Orchestrator',
    description: 'Combines sub-agent feeds, tool data, and prompts into a trade decision.',
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
    type: 'riskAnalyzer',
    label: 'Risk Analyzer',
    description: 'Size trades from portfolio limits — snap market/wallet tools',
    category: 'subagent',
    accent: '#fbbf24',
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
    description: 'Execute Polymarket trades from agent output',
    category: 'tool',
    accent: '#a78bfa',
    toolGroup: 'execution',
  },
  {
    type: 'kalshi',
    label: 'Kalshi',
    description: 'Execute Kalshi trades from agent output',
    category: 'tool',
    accent: '#2dd4bf',
    toolGroup: 'execution',
  },
  {
    type: 'paperTrading',
    label: 'Paper Trading',
    description: 'Simulate YES/NO trades against a paper portfolio session',
    category: 'tool',
    accent: '#d4d4d4',
    toolGroup: 'execution',
  },
  {
    type: 'telegram',
    label: 'Telegram',
    description: 'Bot forwards agent signals to your Telegram username',
    category: 'tool',
    accent: '#38bdf8',
    toolGroup: 'socials',
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
    type: 'xMonitor',
    label: 'X Monitor',
    description: 'Track X handles and alert on tweets matching criteria + topics',
    category: 'tool',
    accent: '#e5e7eb',
    toolGroup: 'socials',
  },
  {
    type: 'walletMonitor',
    label: 'Wallet Monitor',
    description: 'Monitor Polymarket or Kalshi wallet trades by category with keyword suppression',
    category: 'tool',
    accent: '#14b8a6',
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

export function getExecutionGroupItems(
  items: PaletteItem[],
  groupId: PaletteToolGroup,
): PaletteItem[] {
  return items.filter((item) => item.toolGroup === groupId);
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
