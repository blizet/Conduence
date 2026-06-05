import {
  attachSessionAgents,
  beginSession,
  finalizeSession,
} from '../lib/agent-session-log';
import { publishCotToIngress } from '../lib/cot-ingress.client';
import {
  describeGeminiQuotaError,
  GeminiClient,
  isGeminiRateLimitError,
} from '../lib/gemini-client';
import {
  MAIN_AGENT_ID,
  MAIN_AGENT_LOG,
  MAIN_GRAPH_ID,
  MAIN_USER_NODE_ID,
  resolveRepoRelativePath,
} from '../lib/main-agent.config';
import { DecisionEventSchema } from '../schemas/decision.schema';
import { buildCotDecision } from './cot-builder';
import { correlatedMarketsAgent } from './correlated-markets.agent';
import { newsAgent } from './news.agent';
import { whaleWalletAgent } from './whale-wallet.agent';
import type { GeminiTradeDecision, MainInferenceInput, NewsSignal } from './types';

export class MainAgent {
  private readonly gemini: GeminiClient;

  constructor(gemini?: GeminiClient) {
    this.gemini = gemini ?? new GeminiClient();
  }

  async infer(input: MainInferenceInput): Promise<GeminiTradeDecision> {
    return this.gemini.inferTradeDecision(input);
  }

  async processNewsSignal(news: NewsSignal): Promise<void> {
    beginSession();

    console.log(
      `[news-agent] "${news.headline.slice(0, 80)}" keywords=[${news.keywords.join(', ')}] sentiment=${news.sentiment}`,
    );

    const correlated = await correlatedMarketsAgent.find({
      keywords: news.keywords,
      headline: news.headline,
    });
    console.log(
      `[correlated-markets-agent] pm=${correlated.polymarket.length} kal=${correlated.kalshi.length} pairs=${correlated.correlations.length}`,
    );

    const whales = await whaleWalletAgent.track({
      polymarketMarkets: correlated.polymarket,
      keywords: news.keywords,
      headline: news.headline,
    });
    console.log(`[whale-wallet-agent] matches=${whales.entries.length}`);

    attachSessionAgents({ news, correlated, whales });

    try {
      if (correlated.polymarket.length === 0 && whales.entries.length === 0) {
        const decision: GeminiTradeDecision = {
          action: 'HOLD',
          market_id: 'NONE',
          conviction_level: 1,
          thesis: 'No Polymarket markets correlated to this news',
          tags: news.keywords.map((k) => `#${k}`),
          reasoning: `No polymarket matches for keywords [${news.keywords.join(', ') || 'headline'}]`,
        };
        finalizeSession({ status: 'hold', decision });
        console.log('[main-agent] action=HOLD market=NONE conviction=1 (no PM markets)');
        return;
      }

      const decision = await this.infer({ news, correlated, whales });
      console.log(
        `[main-agent] action=${decision.action} market=${decision.market_id} conviction=${decision.conviction_level}`,
      );

      if (decision.action === 'HOLD') {
        finalizeSession({ status: 'hold', decision });
        console.log('[main-agent] HOLD — no CoT emitted');
        return;
      }

      const cot = buildCotDecision(decision, correlated);
      DecisionEventSchema.parse(cot);

      let ingress;
      let ingressError: string | undefined;
      try {
        ingress = await publishCotToIngress(cot, MAIN_AGENT_ID);
        console.log(
          `[main-agent] CoT → Redpanda topic=${ingress.topic} graph=${ingress.graph_id} decision_id=${ingress.decision_id}`,
        );
      } catch (err) {
        ingressError = err instanceof Error ? err.message : String(err);
        console.error(`[main-agent] Redpanda publish failed: ${ingressError}`);
      }

      finalizeSession({
        status: 'cot_produced',
        decision,
        cot,
        ingress,
        ingressError,
      });
      console.log(`[main-agent] session saved → ${resolveRepoRelativePath(MAIN_AGENT_LOG)}`);
    } catch (err) {
      if (isGeminiRateLimitError(err)) {
        const quotaReason = describeGeminiQuotaError(err);
        const decision: GeminiTradeDecision = {
          action: 'HOLD',
          market_id: correlated.polymarket[0]?.id ?? 'NONE',
          conviction_level: 1,
          thesis: `${quotaReason} — holding until billing/quota is restored`,
          tags: news.keywords.map((k) => `#${k}`),
          reasoning: quotaReason,
        };
        finalizeSession({ status: 'hold', decision });
        console.log(
          `[main-agent] action=HOLD market=${decision.market_id} conviction=1 (${quotaReason})`,
        );
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      finalizeSession({ status: 'error', error: message });
      throw err;
    }
  }

  async run(): Promise<void> {
    console.log(
      `[main-agent] starting user=${MAIN_USER_NODE_ID} graph=${MAIN_GRAPH_ID} agent=${MAIN_AGENT_ID}`,
    );
    console.log(`[main-agent] log: ${resolveRepoRelativePath(MAIN_AGENT_LOG)}`);
    for await (const news of newsAgent.streamNewsSignals()) {
      try {
        await this.processNewsSignal(news);
      } catch (err) {
        console.error(`[main-agent] cycle failed: ${err}`);
      }
    }
  }
}

export const mainAgent = new MainAgent();
