export type EndpointTier = 'public' | 'private';

export type ToolEndpointSpec = {
  id: string;
  label: string;
  tier: EndpointTier;
  hint?: string;
};

export type ToolEndpointCatalog = {
  defaultEndpoint: string;
  /** When false, every endpoint needs an API key. */
  hasPublicEndpoints: boolean;
  endpoints: ToolEndpointSpec[];
};

export const TOOL_ENDPOINT_CATALOGS: Record<string, ToolEndpointCatalog> = {
  coingecko: {
    defaultEndpoint: 'simple_price',
    hasPublicEndpoints: true,
    endpoints: [
      { id: 'ping', label: 'Ping — API status', tier: 'public' },
      { id: 'simple_price', label: 'Simple price — spot + 24h change', tier: 'public' },
      { id: 'coins_list', label: 'Coins list — all supported coins', tier: 'public' },
      { id: 'coins_markets', label: 'Coins markets — price, cap, volume', tier: 'public' },
      { id: 'coin_detail', label: 'Coin detail — metadata by ID', tier: 'public' },
      { id: 'search', label: 'Search — coins, categories, markets', tier: 'public' },
      { id: 'global', label: 'Global — market cap & dominance', tier: 'public' },
      { id: 'exchanges', label: 'Exchanges — CEX listings', tier: 'public' },
      { id: 'nfts_list', label: 'NFTs list', tier: 'public' },
      { id: 'onchain_networks', label: 'Onchain — GeckoTerminal networks', tier: 'public' },
      { id: 'coin_market_chart', label: 'Market chart — historical OHLCV', tier: 'private' },
      { id: 'coin_tickers', label: 'Coin tickers — CEX & DEX', tier: 'private' },
      { id: 'onchain_pool_ohlcv', label: 'Onchain — pool OHLCV (GeckoTerminal)', tier: 'private' },
    ],
  },
  coinmarketcap: {
    defaultEndpoint: 'quotes_latest',
    hasPublicEndpoints: false,
    endpoints: [
      { id: 'quotes_latest', label: 'Quotes latest — price by symbol', tier: 'private' },
      { id: 'listings_latest', label: 'Listings latest — ranked by market cap', tier: 'private' },
      { id: 'quotes_historical', label: 'Quotes historical — time series', tier: 'private' },
      { id: 'info', label: 'Info — metadata & logos', tier: 'private' },
      { id: 'global_metrics', label: 'Global metrics — market-wide stats', tier: 'private' },
      { id: 'trending', label: 'Trending — most visited', tier: 'private' },
    ],
  },
  polymarketGamma: {
    defaultEndpoint: 'markets_search',
    hasPublicEndpoints: true,
    endpoints: [
      { id: 'markets_search', label: 'Markets search — keyword + quality score', tier: 'public' },
      { id: 'markets_list', label: 'Markets list — top by volume', tier: 'public' },
      { id: 'events_list', label: 'Events list — active events', tier: 'public' },
    ],
  },
  polymarketWallet: {
    defaultEndpoint: 'wallet_trades',
    hasPublicEndpoints: true,
    endpoints: [
      { id: 'wallet_trades', label: 'Recent trades', tier: 'public' },
      { id: 'wallet_positions', label: 'Open positions', tier: 'public' },
      { id: 'wallet_activity', label: 'Combined activity', tier: 'public' },
    ],
  },
  cryptonews: {
    defaultEndpoint: 'ticker_news',
    hasPublicEndpoints: false,
    endpoints: [
      { id: 'ticker_news', label: 'Ticker news', tier: 'private' },
      { id: 'general_news', label: 'General crypto news', tier: 'private' },
      { id: 'all_ticker_news', label: 'All ticker news', tier: 'private' },
      { id: 'sentiment', label: 'Sentiment analysis', tier: 'private' },
      { id: 'trending_headlines', label: 'Trending headlines', tier: 'private' },
      { id: 'events', label: 'Events', tier: 'private' },
    ],
  },
  tavily: {
    defaultEndpoint: 'search',
    hasPublicEndpoints: false,
    endpoints: [
      { id: 'search', label: 'Search — web results', tier: 'private' },
      { id: 'extract', label: 'Extract — page content', tier: 'private' },
    ],
  },
  cryptoquant: {
    defaultEndpoint: 'metric',
    hasPublicEndpoints: false,
    endpoints: [
      { id: 'metric', label: 'Custom metric path', tier: 'private' },
      { id: 'entity_list', label: 'Entity list — exchanges & miners', tier: 'private' },
    ],
  },
  defillama: {
    defaultEndpoint: 'protocols',
    hasPublicEndpoints: true,
    endpoints: [
      { id: 'protocols', label: 'List protocols', tier: 'public' },
      { id: 'protocol', label: 'Protocol detail', tier: 'public' },
      { id: 'tvl', label: 'Protocol TVL', tier: 'public' },
      { id: 'chains', label: 'All chains TVL', tier: 'public' },
      { id: 'historicalChainTvl', label: 'Historical chain TVL (all)', tier: 'public' },
      { id: 'chain', label: 'Historical chain TVL (one chain)', tier: 'public' },
      { id: 'tokenProtocols', label: 'Token in protocols', tier: 'private' },
      { id: 'inflows', label: 'Protocol inflows (Pro)', tier: 'private' },
      { id: 'chainAssets', label: 'Chain assets (Pro)', tier: 'private' },
    ],
  },
  xMonitor: {
    defaultEndpoint: 'poll',
    hasPublicEndpoints: false,
    endpoints: [
      { id: 'configure', label: 'Configure watchlist', tier: 'public' },
      { id: 'poll', label: 'Poll matching tweets', tier: 'private' },
    ],
  },
  walletMonitor: {
    defaultEndpoint: 'poll',
    hasPublicEndpoints: true,
    endpoints: [
      { id: 'configure', label: 'Configure monitor', tier: 'public' },
      { id: 'poll', label: 'Poll wallet alerts', tier: 'public' },
    ],
  },
};

export function getToolCatalog(toolId: string): ToolEndpointCatalog | undefined {
  return TOOL_ENDPOINT_CATALOGS[toolId];
}

export function getEndpointSpec(toolId: string, endpointId: string): ToolEndpointSpec | undefined {
  return getToolCatalog(toolId)?.endpoints.find((e) => e.id === endpointId);
}

export function endpointRequiresKey(toolId: string, endpointId: string): boolean {
  return getEndpointSpec(toolId, endpointId)?.tier === 'private';
}

/** True when every endpoint for this tool requires an API key. */
export function toolRequiresApiKey(toolId: string): boolean {
  const catalog = getToolCatalog(toolId);
  return catalog ? !catalog.hasPublicEndpoints : false;
}

/** Endpoints available: all if API key set, otherwise public tier only. */
export function getAvailableEndpoints(toolId: string, apiKey: string): ToolEndpointSpec[] {
  const catalog = getToolCatalog(toolId);
  if (!catalog) return [];
  if (apiKey.trim()) return catalog.endpoints;
  return catalog.endpoints.filter((e) => e.tier === 'public');
}

export function accessHint(toolId: string, apiKey: string): string {
  const catalog = getToolCatalog(toolId);
  if (!catalog) return '';
  if (apiKey.trim()) {
    return 'API key set — public and private endpoints available';
  }
  if (toolRequiresApiKey(toolId)) {
    return 'API key required — no public endpoints for this tool';
  }
  return 'No API key — public endpoints only. Add a key to unlock premium endpoints.';
}

export function resolveDefaultEndpoint(
  toolId: string,
  apiKey: string,
  current?: string,
): string {
  const available = getAvailableEndpoints(toolId, apiKey);
  if (current && available.some((e) => e.id === current)) return current;
  const catalog = getToolCatalog(toolId);
  if (catalog && available.some((e) => e.id === catalog.defaultEndpoint)) {
    return catalog.defaultEndpoint;
  }
  return available[0]?.id ?? catalog?.defaultEndpoint ?? '';
}
