import { newsAgent } from './news-agent';
import type { AutonomousAgentConfig, AutonomousAgentDefinition, NewsSignal } from './types';

/** Redpanda topic for one autonomous mind agent: agent.feeds.{agentId}.public */
export function agentFeedTopic(agentId: string): string {
  return `agent.feeds.${agentId}.public`;
}

async function validateNewsConfig(config: AutonomousAgentConfig): Promise<void> {
  const key = config.apiKey?.trim() || process.env.COINDESK_API_KEY?.trim();
  if (!key) {
    throw new Error('CoinDesk API key required — set apiKey, COINDESK_API_KEY in agents/.env, or pass apiKey when starting');
  }
  await newsAgent.pollOnce(key, config.limit ?? 20);
}

async function* streamNewsSignals(config: AutonomousAgentConfig): AsyncGenerator<NewsSignal> {
  const key = config.apiKey?.trim() || process.env.COINDESK_API_KEY?.trim();
  const limit = config.limit ?? 20;
  yield* newsAgent.streamNewsSignals(key, limit);
}

/** Registry of onboarded autonomous mind agents — add entries here only. */
export const AUTONOMOUS_AGENT_REGISTRY: Record<string, AutonomousAgentDefinition> = {
  newsAgent: {
    id: 'newsAgent',
    eventType: 'news.signal',
    feedTopic: agentFeedTopic('newsAgent'),
    validateConfig: validateNewsConfig,
    streamSignals: streamNewsSignals,
  },
};

export function getAutonomousAgent(agentId: string): AutonomousAgentDefinition | undefined {
  return AUTONOMOUS_AGENT_REGISTRY[agentId];
}

export function listAutonomousAgentFeedTopics(): string[] {
  return Object.values(AUTONOMOUS_AGENT_REGISTRY).map((def) => def.feedTopic);
}

export function listAutonomousAgentIds(): string[] {
  return Object.keys(AUTONOMOUS_AGENT_REGISTRY);
}
