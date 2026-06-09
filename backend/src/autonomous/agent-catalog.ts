import { agentFeedTopic, listAutonomousAgentFeedTopics } from '@cot-kb/agents';

export type MarketplaceAgentDef = {
  id: string;
  nodeType: string;
  name: string;
  description: string;
  autonomous: boolean;
  accent: string;
  core?: boolean;
  feedTopic?: string;
  eventType?: string;
};

export const MARKETPLACE_CATALOG: MarketplaceAgentDef[] = [
  {
    id: 'llm',
    nodeType: 'llm',
    name: 'LLM Analyzer',
    description: 'Main inference — synthesizes feeds into trade decisions',
    autonomous: false,
    accent: '#f472b6',
    core: true,
  },
  {
    id: 'newsAgent',
    nodeType: 'newsAgent',
    name: 'News Agent',
    description: 'Autonomous CoinDesk feed → dedicated Redpanda topic for subscribers',
    autonomous: true,
    accent: '#fb923c',
    feedTopic: agentFeedTopic('newsAgent'),
    eventType: 'news.signal',
  },
];

export { listAutonomousAgentFeedTopics };
