import { getPaletteItem } from '@/nodes';
import type { NodeCategory } from '@/nodes/types';

export type NodeCatalogEntry = {
  summary: string;
  helpsWith: string[];
};

const EXTENDED: Partial<Record<string, NodeCatalogEntry>> = {
  defillama: {
    summary:
      'DeFiLlama aggregates total value locked (TVL) across DeFi protocols and chains. Most endpoints are free; Pro endpoints need an API key.',
    helpsWith: [
      'Track protocol or chain TVL when a signal mentions DeFi stress, exploits, or liquidity rotation.',
      'Compare sector-wide DeFi health with chain-level historical TVL series.',
      'Find which protocols hold a specific token (Pro endpoint).',
    ],
  },
  coingecko: {
    summary:
      'CoinGecko provides free spot prices and 24h change for crypto assets using lowercase coin IDs (e.g. bitcoin, ethereum).',
    helpsWith: [
      'Quick USD price checks without API keys.',
      'Multi-asset momentum snapshots for orchestrator context.',
    ],
  },
  coinmarketcap: {
    summary:
      'CoinMarketCap returns richer market data by ticker symbol — price, volume, market cap, and multi-timeframe change.',
    helpsWith: [
      'Quotes when you only have tickers (BTC, ETH) rather than CoinGecko slugs.',
      'Non-USD quotes and ranking context.',
    ],
  },
  cryptonews: {
    summary: 'CryptoNews API delivers filtered headlines, sentiment tags, and event feeds for crypto markets.',
    helpsWith: [
      'Headline discovery filtered by ticker or keyword.',
      'Sentiment and category tags for news-driven signals.',
    ],
  },
  cryptoquant: {
    summary:
      'CryptoQuant surfaces on-chain and exchange-flow metrics — netflows, whale ratios, funding rates, and reserves.',
    helpsWith: [
      'Validate whether exchange inflow/outflow supports a narrative.',
      'Whale and miner flow context beyond spot price.',
    ],
  },
  tavily: {
    summary: 'Tavily performs web search and page extraction to enrich agent context beyond structured APIs.',
    helpsWith: [
      'Fill gaps when no structured tool covers the question.',
      'Pull recent web context for breaking events.',
    ],
  },
  polymarketGamma: {
    summary:
      'Polymarket Gamma search finds open prediction markets by keyword, ranked by volume, liquidity, and spread quality.',
    helpsWith: [
      'Discover tradable markets matching a theme or ticker.',
      'Filter illiquid or wide-spread markets before wiring venue tools.',
    ],
  },
  polymarketWallet: {
    summary: 'Inspect recent trades and open positions for a Polymarket wallet address.',
    helpsWith: [
      'Follow smart-money or whale wallet activity.',
      'Cross-check positioning against your thesis.',
    ],
  },
  clob: {
    summary:
      'Polymarket execution sink — receives a trade order from a wired agent and submits it to the CLOB.',
    helpsWith: [
      'Wire Orchestrator or sub-agent output → Input, then run workflow to execute.',
      'Maps agent JSON (action, tokenId, size, price) into Polymarket order format.',
    ],
  },
  kalshi: {
    summary: 'Kalshi execution sink — receives a trade order from a wired agent and submits it on Kalshi.',
    helpsWith: [
      'Wire Orchestrator or sub-agent output → Input, then run workflow to execute.',
      'Maps agent JSON (action, ticker, side, count, price) into Kalshi order format.',
    ],
  },
  telegram: {
    summary:
      'Telegram bot notifier — forwards agent signals (thesis, trade, news) to your Telegram username or chat ID.',
    helpsWith: [
      'Alert yourself when an agent emits a decision or sized trade.',
      'Wire any agent output → Input and run workflow to send a formatted message.',
    ],
  },
  cotBuilder: {
    summary:
      'CoT Builder formats orchestrator decisions and correlated markets into a DecisionEvent graph JSON.',
    helpsWith: [
      'Emit structured chain-of-thought to the knowledge graph.',
      'Auto-publish to Redpanda when Go Live or auto-emit is enabled.',
    ],
  },
  workflowOutput: {
    summary: 'Terminal node that displays the final payload from a workflow run.',
    helpsWith: ['Inspect the merged result after Run Workflow completes.'],
  },
  llm: {
    summary:
      'Central router — ingests sub-agent feeds, plans parallel tool calls, runs the decision engine, and LLM-synthesizes a trade thesis for downstream CoT or execution.',
    helpsWith: [
      'Wire Tools (left), Memory, and Feed inputs from sub-agents.',
      'Route outputs to CoT Builder, execution tools, or Telegram.',
      'Go Live to run continuously with LangGraph + observability.',
    ],
  },
  newsAgent: {
    summary:
      'News sub-agent streams CoinDesk headlines, runs LLM inference for sentiment and thesis, and publishes to the agent feed.',
    helpsWith: [
      'Continuous news monitoring when workflow is Go Live.',
      'Structured news signals wired into the orchestrator.',
    ],
  },
  arbitrageAgent: {
    summary:
      'Arbitrage sub-agent scans Polymarket × Kalshi for same-event opportunities with LLM verification.',
    helpsWith: [
      'Surface cross-venue arb with fee-adjusted edge.',
      'Verify two markets resolve on the same fact before trading.',
    ],
  },
  riskAnalyzer: {
    summary:
      'Risk sub-agent sizes a user-defined trade from portfolio limits, confidence, and live liquidity.',
    helpsWith: [
      'Deterministic position sizing from bankroll and risk parameters.',
      'Emit sized trade payloads wired to execution tools or the orchestrator.',
    ],
  },
  sportsScanner: {
    summary:
      'External Kalshi soccer scanner — receives late-game signals from the kalshiSports publisher via HTTP wrapper.',
    helpsWith: [
      'Specialized sports feed for Kalshi soccer markets.',
      'Install from marketplace to subscribe to the publisher.',
    ],
  },
};

const CATEGORY_DEFAULTS: Record<NodeCategory, NodeCatalogEntry> = {
  tool: {
    summary: 'Workflow tool node — fetches structured data or executes venue actions.',
    helpsWith: ['Wire into the orchestrator or sub-agents for live context.'],
  },
  subagent: {
    summary: 'Autonomous sub-agent that runs on Go Live and publishes to the agent feed.',
    helpsWith: ['Snap venue tools and stream signals into the orchestrator.'],
  },
  orchestrator: {
    summary: 'Central mind agent that synthesizes inputs into decisions.',
    helpsWith: ['Connect tools, sub-agents, and CoT builder outputs.'],
  },
  mindagent: {
    summary: 'Mind agent node for specialized autonomous workflows.',
    helpsWith: ['Extend the canvas with custom agent logic.'],
  },
};

export function getNodeCatalog(type: string | undefined): NodeCatalogEntry {
  if (!type) {
    return {
      summary: 'Select a node on the canvas to configure it.',
      helpsWith: [],
    };
  }
  if (EXTENDED[type]) return EXTENDED[type]!;
  const item = getPaletteItem(type);
  if (item) {
    return {
      summary: item.description,
      helpsWith: CATEGORY_DEFAULTS[item.category].helpsWith,
    };
  }
  return CATEGORY_DEFAULTS.tool;
}
