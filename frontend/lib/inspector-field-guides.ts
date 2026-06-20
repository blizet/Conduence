export type FieldGuideLink = {
  label: string;
  href: string;
};

export type FieldGuideEntry = {
  field: string;
  description: string;
  /** Optional tip on where to find the value or obtain credentials. */
  howTo?: string;
  link?: FieldGuideLink;
};

export type NodeFieldGuide = {
  intro?: string;
  fields: FieldGuideEntry[];
};

export type SetupGuideStep = {
  title: string;
  detail: string;
  link?: FieldGuideLink;
};

export type NodeSetupGuide = {
  title?: string;
  steps: SetupGuideStep[];
};

const LLM_FIELDS: FieldGuideEntry[] = [
  {
    field: 'LLM provider',
    description: 'Which API powers inference for this agent.',
    howTo: 'Choose OpenAI, Google Gemini, or Anthropic Claude based on your subscription.',
  },
  {
    field: 'Model',
    description: 'Specific model ID sent to the provider API.',
    howTo: 'Pick a preset or choose Custom and paste the exact model slug from your provider docs.',
  },
  {
    field: 'LLM API key',
    description: 'Secret key for the selected provider. Stored on this node only.',
    howTo:
      'OpenAI → platform.openai.com/api-keys · Gemini → aistudio.google.com/apikey · Claude → console.anthropic.com/settings/keys',
  },
  {
    field: 'Temperature',
    description: 'Sampling randomness (0 = deterministic, 1 = creative).',
    howTo: 'Use 0.3–0.7 for trading decisions; lower when you want consistent JSON output.',
  },
  {
    field: 'Max tokens',
    description: 'Upper bound on model response length.',
    howTo: '2048 is usually enough for a single trade-decision JSON object.',
  },
];

export const INSPECTOR_FIELD_GUIDES: Record<string, NodeFieldGuide> = {
  llm: {
    intro: 'The orchestrator synthesizes feeds, tool results, and graph context into one trade decision.',
    fields: [
      ...LLM_FIELDS,
      {
        field: 'System prompt',
        description: 'Instructions that define the JSON schema and decision rules.',
        howTo: 'Keep the default unless you need stricter HOLD gates or extra output fields (e.g. tokenId for Polymarket execution).',
      },
      {
        field: 'User prompt',
        description: 'Task framing appended to the live signal + tool context.',
        howTo: 'Describe what to prioritize — e.g. “only act on ETF headlines with conviction ≥ 7”.',
      },
      {
        field: 'News filter',
        description: 'Optional category chips to filter the live news feed before synthesis.',
        howTo: 'Leave empty to accept all categories; select chips to narrow the orchestrator input.',
      },
    ],
  },

  newsAgent: {
    intro: 'Polls wired feed tools, runs LLM on each headline batch, and publishes structured signals.',
    fields: [
      ...LLM_FIELDS,
      {
        field: 'User prompt (strategy focus)',
        description: 'Extra instructions layered on the fixed news-analysis system prompt.',
        howTo: 'Example: “Weight regulation and ETF flow headlines; ignore celebrity crypto tweets.”',
      },
      {
        field: 'Simulate mode',
        description: 'Uses canned headlines instead of live CryptoNews/Tavily feeds.',
        howTo: 'Enable for local testing without API keys on feed tools; LLM is still called.',
      },
      {
        field: 'Snap tools (bottom port)',
        description: 'Wire CryptoNews and/or Tavily into the Tools port for live headline polling.',
        howTo: 'Drag market-data / helper tools onto the sub-agent’s bottom Tools diamond.',
      },
    ],
  },

  arbitrageAgent: {
    intro: 'Scans Polymarket × Kalshi for same-event opportunities and verifies with LLM.',
    fields: [
      ...LLM_FIELDS,
      {
        field: 'User prompt (strategy focus)',
        description: 'Filters which arb candidates the LLM should verify.',
        howTo: 'Example: “Only crypto threshold markets with >$50K liquidity and net edge ≥ 2¢.”',
      },
      {
        field: 'Simulate mode',
        description: 'Uses offline fixture markets instead of live Gamma/Kalshi lists.',
        howTo: 'Good for demo workflows; disable for production scanning.',
      },
      {
        field: 'Snap tools (bottom port)',
        description: 'Wire Polymarket Markets + Kalshi quote/list tools for live market discovery.',
        howTo: 'Both venues must be snapped so the scanner can fetch comparable markets.',
      },
    ],
  },

  riskAnalyzer: {
    intro: 'Sizes a user-defined trade from portfolio limits, confidence, and optional live liquidity.',
    fields: [
      {
        field: 'Portfolio (USD)',
        description: 'Total bankroll used to compute position size percentages.',
        howTo: 'Example: 10000 for a $10K paper portfolio.',
      },
      {
        field: 'Risk % min / max',
        description: 'Minimum and maximum fraction of portfolio to risk per trade.',
        howTo: 'Default 2%–5% — higher confidence maps linearly toward the max.',
      },
      {
        field: 'Min confidence',
        description: 'Trades below this conviction are rejected (HOLD).',
        howTo: 'Set trade confidence above this threshold for sized output.',
      },
      {
        field: 'Trade action / market / price',
        description: 'The proposed trade — action, market ID or title, entry price, and confidence.',
        howTo: 'Fill market slug or ticker, side (BUY YES/NO), limit price, and your conviction 0–1.',
      },
      {
        field: 'Simulate mode',
        description: 'Uses fixture market liquidity instead of live tool data.',
        howTo: 'Enable for demos without wiring Polymarket Gamma or Kalshi.',
      },
      {
        field: 'Snap tools (bottom port)',
        description: 'Optional Polymarket Markets, Wallet, or Kalshi for live liquidity and exposure.',
        howTo: 'Wire helpers to auto-fetch liquidity and cap size against open positions.',
      },
    ],
  },

  clob: {
    intro: 'Execution sink — maps agent trade JSON to a Polymarket CLOB limit order.',
    fields: [
      {
        field: 'Input port',
        description: 'Wire Orchestrator or sub-agent output here.',
        howTo: 'Agent payload needs action, tokenId, size, and price. Run workflow first to populate the preview.',
      },
      {
        field: 'Default size',
        description: 'Fallback order size when the agent JSON omits size.',
        howTo: 'Prefer putting size in the agent decision; this is an optional safety net.',
      },
      {
        field: 'Default price',
        description: 'Fallback limit price (0–1) when the agent JSON omits price.',
        howTo: 'Example: 0.55 for a 55¢ yes token on Polymarket.',
      },
      {
        field: 'Polymarket API key',
        description: 'CLOB API key ID from your Polymarket builder profile.',
        howTo: 'Polymarket → Settings → Builder → create API credentials.',
        link: { label: 'Polymarket builder', href: 'https://polymarket.com/settings?tab=builder' },
      },
      {
        field: 'Polymarket secret',
        description: 'API secret paired with the key above.',
        howTo: 'Shown once at creation — store securely; paste here for live order submission.',
      },
      {
        field: 'Passphrase',
        description: 'Third credential required by the Polymarket CLOB auth headers.',
        howTo: 'Issued together with key + secret in the builder API credentials flow.',
      },
    ],
  },

  kalshi: {
    intro: 'Execution sink — maps agent trade JSON to a Kalshi limit order.',
    fields: [
      {
        field: 'Input port',
        description: 'Wire Orchestrator or sub-agent output here.',
        howTo: 'Agent payload needs action, ticker, side (yes/no), count, and price in cents.',
      },
      {
        field: 'Default contracts',
        description: 'Fallback contract count when the agent JSON omits count.',
        howTo: 'Integer number of Kalshi contracts to buy/sell.',
      },
      {
        field: 'Default limit (¢)',
        description: 'Fallback limit price in cents when the agent JSON omits price.',
        howTo: 'Must be 1–99 cents on Kalshi (e.g. 50 = 50¢).',
      },
      {
        field: 'Kalshi API key ID',
        description: 'Access key from Kalshi account settings.',
        howTo: 'Kalshi → Account → Profile → API Keys → Create key.',
        link: { label: 'Kalshi API docs', href: 'https://docs.kalshi.com/getting_started/api_keys' },
      },
      {
        field: 'Kalshi private key (PEM)',
        description: 'RSA private key downloaded when the API key was created.',
        howTo: 'Paste the full PEM including BEGIN/END lines. Kalshi only shows the private key once.',
      },
    ],
  },

  paperTrading: {
    intro: 'Paper execution sink — simulates prediction market trades against a saved paper session.',
    fields: [
      {
        field: 'Input port',
        description: 'Wire Orchestrator or sub-agent output here.',
        howTo: 'Agent payload needs action (BUY_YES, BUY_NO, etc.), market, price, and conviction.',
      },
      {
        field: 'Strategy workflow',
        description: 'Which saved workflow strategy this paper sink uses for session lookup.',
        howTo: 'Pick any workflow you saved on the Workflow canvas — sessions are matched by workflow id.',
      },
      {
        field: 'Paper session',
        description: 'Which paper portfolio session receives simulated trades.',
        howTo: 'Create sessions on Paper Trading — set starting capital, risk limits, and linked workflow there.',
      },
    ],
  },

  telegram: {
    intro: 'Social execution sink — your bot sends formatted agent output to Telegram.',
    fields: [
      {
        field: 'Input port',
        description: 'Wire Orchestrator or sub-agent output here.',
        howTo: 'Any agent JSON works — thesis, summary, action, and trade fields are formatted into the message.',
      },
      {
        field: 'Bot token',
        description: 'Token from @BotFather for your Telegram bot.',
        howTo: 'Create a bot via /newbot in @BotFather, or set TELEGRAM_BOT_TOKEN in backend/.env.',
      },
      {
        field: 'Telegram username',
        description: 'Target @username (without @) for public channels/groups.',
        howTo: 'Example: my_trading_alerts → messages go to @my_trading_alerts.',
      },
      {
        field: 'Chat ID (optional)',
        description: 'Numeric chat ID — required for private DMs after you /start the bot.',
        howTo: 'Message your bot, then use getUpdates or a chat-ID bot to find your numeric ID.',
      },
    ],
  },

  workflowOutput: {
    intro: 'Terminal node — displays the final JSON from the upstream workflow step.',
    fields: [
      {
        field: 'Output payload',
        description: 'Read-only result after Run Workflow completes.',
        howTo: 'Wire any runnable tool or the Orchestrator into this node’s input.',
      },
    ],
  },

  output: {
    intro: 'Alias for Workflow Output — same behavior.',
    fields: [
      {
        field: 'Output payload',
        description: 'Read-only result after Run Workflow completes.',
        howTo: 'Wire any runnable tool or the Orchestrator into this node’s input.',
      },
    ],
  },

  defillama: {
    intro: 'DeFiLlama TVL and protocol data — most endpoints are free without a key.',
    fields: [
      {
        field: 'Endpoint',
        description: 'Which DeFiLlama API route to call.',
        howTo: 'protocols/chains/tvl are public; tokenProtocols and inflows need Pro.',
      },
      {
        field: 'Protocol slug',
        description: 'Lowercase slug from defillama.com/protocol/{slug}.',
        howTo: 'Examples: aave, lido, uniswap, makerdao.',
      },
      {
        field: 'Chain name',
        description: 'Chain label for chain-specific TVL history.',
        howTo: 'Examples: Ethereum, Arbitrum, Base, Solana.',
      },
      {
        field: 'Token symbol',
        description: 'Token ticker for “which protocols hold this token” (Pro).',
        howTo: 'Lowercase symbol, e.g. usdt, weth.',
      },
      {
        field: 'API key',
        description: 'DeFiLlama Pro key for paid endpoints only.',
        howTo: 'Subscribe at defillama.com/pro — not needed for free TVL endpoints.',
        link: { label: 'DeFiLlama Pro', href: 'https://defillama.com/pro' },
      },
    ],
  },

  coingecko: {
    intro: 'Spot prices and market metadata — public Demo API works without a key.',
    fields: [
      {
        field: 'Endpoint',
        description: 'CoinGecko API route (simple_price, search, global, …).',
        howTo: 'simple_price is the default for quick BTC/ETH quotes.',
      },
      {
        field: 'Coin IDs',
        description: 'Comma-separated CoinGecko IDs (not tickers).',
        howTo: 'Use lowercase slugs: bitcoin, ethereum, solana. Find IDs via coingecko.com search or coins/list.',
        link: { label: 'CoinGecko API', href: 'https://www.coingecko.com/en/api' },
      },
      {
        field: 'API key',
        description: 'Optional Demo/Pro key for higher rate limits and private endpoints.',
        howTo: 'Sign up at coingecko.com/en/api/pricing — free tier available.',
        link: { label: 'Get API key', href: 'https://www.coingecko.com/en/developers/dashboard' },
      },
    ],
  },

  coinmarketcap: {
    intro: 'Rich quotes by ticker symbol — requires a CoinMarketCap API key.',
    fields: [
      {
        field: 'Endpoint',
        description: 'CMC API route (quotes_latest, listings_latest, …).',
        howTo: 'quotes_latest fetches price/volume for Symbols you set below.',
      },
      {
        field: 'Symbols',
        description: 'Comma-separated tickers (BTC, ETH, SOL).',
        howTo: 'Use uppercase symbols as shown on coinmarketcap.com.',
      },
      {
        field: 'Convert currency',
        description: 'Quote currency for prices (usually USD).',
        howTo: 'Any fiat or crypto symbol supported by CMC convert parameter.',
      },
      {
        field: 'API key',
        description: 'Required for all CoinMarketCap endpoints.',
        howTo: 'CoinMarketCap → Developer → Get free API key (Basic plan).',
        link: { label: 'CMC Developer Portal', href: 'https://coinmarketcap.com/api/' },
      },
    ],
  },

  cryptonews: {
    intro: 'Filtered crypto headlines with sentiment tags.',
    fields: [
      {
        field: 'Endpoint',
        description: 'News route (ticker_news, general_news, sentiment, …).',
        howTo: 'ticker_news filters by Tickers; general_news needs no ticker.',
      },
      {
        field: 'Tickers',
        description: 'Comma-separated symbols to filter headlines (BTC, ETH).',
        howTo: 'Leave empty for general_news endpoint.',
      },
      {
        field: 'Max items',
        description: 'Number of articles to return per request.',
        howTo: '5–20 is typical for agent context windows.',
      },
      {
        field: 'Sentiment filter',
        description: 'Optional filter: positive, negative, neutral.',
        howTo: 'Comma-separate multiple values if the API supports it.',
      },
      {
        field: 'Keywords',
        description: 'Extra keyword filter (ETF, regulation, …).',
        howTo: 'Narrows headlines beyond ticker match.',
      },
      {
        field: 'API key',
        description: 'Required — CryptoNews API subscription.',
        howTo: 'Register at cryptonews-api.com and copy your API token.',
        link: { label: 'CryptoNews API', href: 'https://cryptonews-api.com/' },
      },
    ],
  },

  cryptoquant: {
    intro: 'On-chain and exchange-flow metrics (netflows, reserves, funding).',
    fields: [
      {
        field: 'Endpoint',
        description: 'metric (custom path) or entity_list.',
        howTo: 'Use metric for time-series; entity_list for exchange/miner IDs.',
      },
      {
        field: 'Metric path',
        description: 'API path segment after /v1/ (e.g. btc/exchange-flows/netflow).',
        howTo: 'Browse metrics in CryptoQuant API docs for the exact path string.',
        link: { label: 'CryptoQuant API', href: 'https://cryptoquant.com/docs' },
      },
      {
        field: 'Symbol',
        description: 'Asset code for the metric (btc, eth).',
        howTo: 'Lowercase as used in CryptoQuant URL paths.',
      },
      {
        field: 'Window',
        description: 'Aggregation window: hour, day, block.',
        howTo: 'day is default for daily netflow charts.',
      },
      {
        field: 'Exchange',
        description: 'Exchange entity filter (binance, coinbase, …).',
        howTo: 'Use entity_list endpoint first to see valid exchange codes.',
      },
      {
        field: 'API key',
        description: 'Required — CryptoQuant API subscription.',
        howTo: 'CryptoQuant → API → create token in your account dashboard.',
        link: { label: 'CryptoQuant', href: 'https://cryptoquant.com/' },
      },
    ],
  },

  tavily: {
    intro: 'Web search and page extraction for breaking context beyond structured APIs.',
    fields: [
      {
        field: 'Endpoint',
        description: 'search (web results) or extract (URL content).',
        howTo: 'search for discovery; extract when you have specific URLs.',
      },
      {
        field: 'Search query',
        description: 'Natural-language question or keywords.',
        howTo: 'Be specific: “Bitcoin ETF inflow record March 2026” beats “bitcoin news”.',
      },
      {
        field: 'Search depth',
        description: 'basic (faster) or advanced (deeper crawl).',
        howTo: 'advanced costs more API credits but returns richer snippets.',
      },
      {
        field: 'Max results',
        description: 'Cap on returned search hits.',
        howTo: '3–8 is enough for agent enrichment.',
      },
      {
        field: 'Extract URLs',
        description: 'Comma-separated URLs for extract endpoint.',
        howTo: 'Only used when Endpoint = extract.',
      },
      {
        field: 'API key',
        description: 'Required — Tavily API key.',
        howTo: 'Sign up at tavily.com; free tier includes limited searches/month.',
        link: { label: 'Tavily', href: 'https://tavily.com/' },
      },
    ],
  },

  polymarketGamma: {
    intro: 'Search open Polymarket prediction markets by keyword — public, no key.',
    fields: [
      {
        field: 'Endpoint',
        description: 'markets_search (keyword) or markets_list (top volume).',
        howTo: 'markets_search ranks by quality score using filters below.',
      },
      {
        field: 'Keywords',
        description: 'Search terms matched against market questions.',
        howTo: 'Examples: bitcoin, election, fed rate. Comma or space separated.',
      },
      {
        field: 'Limit',
        description: 'Max markets returned.',
        howTo: '8–20 for orchestrator context; raise for arb scanner feeds.',
      },
      {
        field: 'Min volume / liquidity',
        description: 'Quality filters — drops illiquid markets.',
        howTo: 'Raise min volume to avoid untradeable tails; typical floor 5000–10000.',
      },
      {
        field: 'Max spread',
        description: 'Maximum bid-ask spread (0–1 probability units).',
        howTo: '0.05 = 5¢ max spread; tighter = fewer but cleaner markets.',
      },
    ],
  },

  polymarketWallet: {
    intro: 'Inspect a wallet’s recent trades or open positions — public Data API.',
    fields: [
      {
        field: 'Endpoint',
        description: 'wallet_trades, wallet_positions, or combined activity.',
        howTo: 'trades for flow; positions for current exposure.',
      },
      {
        field: 'Wallet address',
        description: '0x-prefixed Polygon address on Polymarket.',
        howTo: 'Copy from polymarket.com profile or block explorer.',
      },
      {
        field: 'Action',
        description: 'Recent trades vs open positions view.',
        howTo: 'Match to the endpoint you selected.',
      },
      {
        field: 'Limit',
        description: 'Number of rows returned.',
        howTo: '10–50 for whale-tracking workflows.',
      },
    ],
  },

  xMonitor: {
    intro: 'Track X handles and surface tweets matching alert criteria and topics.',
    fields: [
      {
        field: 'X usernames',
        description: 'Comma-separated handles to watch (without @).',
        howTo: 'Add influencers, news desks, or protocol founders relevant to your thesis.',
      },
      {
        field: 'Alert criteria',
        description: 'What tweet types should trigger alerts.',
        howTo: 'Examples: breaking news, ETF approval, regulatory action, whale calls.',
      },
      {
        field: 'Topics',
        description: 'Keywords that must appear in tweet text.',
        howTo: 'Pair with alert criteria — e.g. criteria “breaking news” + topics “bitcoin, ethereum”.',
      },
      {
        field: 'X Bearer token',
        description: 'Twitter API v2 bearer token for polling timelines.',
        howTo: 'Set on the node or X_BEARER_TOKEN in backend/.env.',
      },
    ],
  },

  walletMonitor: {
    intro: 'Monitor prediction-market wallet activity with category include + keyword suppress rules.',
    fields: [
      {
        field: 'Platform',
        description: 'Polymarket or Kalshi — one platform per node.',
        howTo: 'Polymarket supports public third-party wallet tracking; Kalshi polls authenticated fills only.',
      },
      {
        field: 'Wallet addresses',
        description: 'Polymarket 0x addresses to watch.',
        howTo: 'Comma-separate up to five wallets from polymarket.com profiles.',
      },
      {
        field: 'Categories',
        description: 'Trade themes to include (geopolitics, crypto, politics, …).',
        howTo: 'Example: geopolitics to focus on macro conflict markets.',
      },
      {
        field: 'Suppress keywords',
        description: 'Phrases that drop otherwise matching trades.',
        howTo: 'Example: include geopolitics but suppress “russia-ukraine”.',
      },
    ],
  },
};

export const INSPECTOR_SETUP_GUIDES: Record<string, NodeSetupGuide> = {
  telegram: {
    title: 'Telegram bot setup',
    steps: [
      {
        title: 'Create a bot',
        detail:
          'Open @BotFather in Telegram, run /newbot, and copy the bot token into Bot token below — or set TELEGRAM_BOT_TOKEN in backend/.env.',
        link: { label: 'Open @BotFather', href: 'https://t.me/BotFather' },
      },
      {
        title: 'Private DMs',
        detail:
          'Open your new bot in Telegram and send /start. Then paste your numeric Chat ID below. Username alone cannot deliver private DMs.',
      },
      {
        title: 'Public channels',
        detail:
          'Add the bot as an admin to your channel, then set the channel @username in Telegram username (without the @).',
      },
      {
        title: 'Wire & run',
        detail:
          'Connect an agent output → Input on this node, then Run workflow. The agent payload (thesis, action, trade fields) is formatted and sent.',
      },
    ],
  },
};

export function findFieldGuideEntry(nodeType: string | undefined, fieldName: string | null) {
  if (!nodeType || !fieldName) return null;
  const guide = INSPECTOR_FIELD_GUIDES[nodeType];
  if (!guide) return null;
  return guide.fields.find((entry) => entry.field === fieldName) ?? null;
}

export function getInspectorFieldGuide(nodeType: string | undefined): NodeFieldGuide | null {
  if (!nodeType) return null;
  return INSPECTOR_FIELD_GUIDES[nodeType] ?? null;
}

export function getInspectorSetupGuide(nodeType: string | undefined): NodeSetupGuide | null {
  if (!nodeType) return null;
  return INSPECTOR_SETUP_GUIDES[nodeType] ?? null;
}
