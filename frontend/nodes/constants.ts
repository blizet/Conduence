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
3. Any arbitrage opportunities surfaced by sub-agents

Synthesize into one trade decision JSON. Explain conflicts in reasoning.`;

export const DEFAULT_COT_GRAPH_ID = 'user_771.main.v1';
export const DEFAULT_COT_USER_NODE_ID = 'user_771';

export const DEFAULT_COT_DECISION_JSON = `{
  "action": "BUY_YES",
  "market_id": "PM_EXAMPLE",
  "market_slug": "example-market",
  "conviction_level": 7,
  "thesis": "News sentiment + market structure align bullish",
  "tags": ["#crypto", "#momentum"],
  "reasoning": "Headline sentiment bullish; correlated PM market shows alignment."
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

