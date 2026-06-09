export const DEFAULT_LLM_SYSTEM_PROMPT = `You are a trading analyst synthesizing autonomous news signals.
Output ONLY valid JSON matching this schema:
{
  "action": "BUY_YES" | "BUY_NO" | "HOLD",
  "market_id": "string or NONE",
  "conviction_level": 1-10,
  "thesis": "short trade thesis",
  "tags": ["#tag1"],
  "reasoning": "brief chain-of-thought"
}
Rules:
- Base decisions on news headline, sentiment, keywords, and categories.
- Return HOLD if conviction is low or signals are unclear.
- Do not wrap JSON in markdown fences.`;

export const DEFAULT_LLM_USER_PROMPT = `Analyze all connected workflow inputs:
1. Latest news signal (headline, sentiment, keywords)
2. Correlated Polymarket / Kalshi markets
3. Whale wallet activity

Synthesize into one trade decision JSON. Explain conflicts in reasoning.`;

export const DEFAULT_COT_GRAPH_ID = 'user_771.main.v1';
export const DEFAULT_COT_USER_NODE_ID = 'user_771';

export const DEFAULT_COT_DECISION_JSON = `{
  "action": "BUY_YES",
  "market_id": "PM_EXAMPLE",
  "market_slug": "example-market",
  "conviction_level": 7,
  "thesis": "News + whale flow align bullish",
  "tags": ["#crypto", "#momentum"],
  "reasoning": "Headline sentiment bullish; correlated PM market shows whale accumulation."
}`;

export const DEFAULT_COT_CORRELATED_JSON = `{
  "polymarket": [
    {
      "id": "PM_EXAMPLE",
      "venue": "polymarket",
      "title": "Example market",
      "slug": "example-market",
      "url": "https://polymarket.com"
    }
  ],
  "kalshi": [],
  "correlations": []
}`;

export const DEFAULT_WHALE_WALLET_SYSTEM_PROMPT = `You are the Whale Wallet sub-agent in a Polymarket Chain-of-Thought workflow.
Scan configured proxy wallets for recent Polymarket trades aligned with upstream news and correlated markets.

Output ONLY valid JSON matching this schema:
{
  "entries": [
    {
      "wallet": "0x…",
      "pseudonym": "string",
      "name": "string",
      "market": {
        "id": "PM_…",
        "venue": "polymarket",
        "title": "string",
        "slug": "optional string",
        "conditionId": "optional string"
      },
      "side": "BUY" | "SELL",
      "outcome": "Yes" | "No",
      "size": number,
      "price": number,
      "timestamp": unix_ms,
      "transactionHash": "0x…"
    }
  ]
}

Rules:
- Match trades to correlated Polymarket markets by conditionId or slug first.
- If no direct market match, score trades against news keywords (minimum score 2).
- Deduplicate by transactionHash; return at most 25 entries.
- Return { "entries": [] } when nothing matches.
- Do not wrap JSON in markdown fences.`;

export const DEFAULT_WHALE_WALLET_USER_PROMPT = `Track whale wallet activity for this workflow step.

Use:
1. Wallet addresses configured on this node
2. Correlated Polymarket markets from upstream
3. News signal — headline, keywords, sentiment

Return WhaleActivityResult JSON. Prioritize large trade size and alignment with news direction.`;
