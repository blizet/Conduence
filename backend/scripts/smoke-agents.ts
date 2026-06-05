import { correlatedMarketsAgent } from '../src/agents/correlated-markets.agent';
import { extractShortTailKeywords } from '../src/agents/news.agent';
import { whaleWalletAgent } from '../src/agents/whale-wallet.agent';
import {
  attachSessionAgents,
  beginSession,
  finalizeSession,
} from '../src/lib/agent-session-log';
import { MAIN_AGENT_LOG, resolveRepoRelativePath } from '../src/lib/main-agent.config';

async function main() {
  beginSession('smoke-test');
  const headline = 'Bitcoin surges past 100k as ETF inflows accelerate';
  const keywords = extractShortTailKeywords(headline);

  const news = {
    headline,
    url: 'https://example.com/smoke',
    publishedAt: new Date().toISOString(),
    sentiment: 'bullish' as const,
    keywords,
    source: 'smoke-test',
  };

  const correlated = await correlatedMarketsAgent.find({ keywords, headline });
  const whales = await whaleWalletAgent.track({
    polymarketMarkets: correlated.polymarket,
    keywords,
    headline,
  });

  attachSessionAgents({ news, correlated, whales });
  finalizeSession({
    status: 'hold',
    decision: {
      action: 'HOLD',
      market_id: 'N/A',
      conviction_level: 0,
      thesis: 'smoke test',
      tags: [],
      reasoning: 'Gemini not invoked in smoke test',
    },
  });

  console.log('keywords:', keywords);
  console.log('correlated pm:', correlated.polymarket.length, 'kal:', correlated.kalshi.length);
  console.log('whale entries:', whales.entries.length);
  console.log(`log: ${resolveRepoRelativePath(MAIN_AGENT_LOG)}`);
}

main().catch(console.error);
