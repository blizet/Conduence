import type { PaletteItem, WorkflowNodeData } from '@/nodes/types';
import {
  DEFAULT_COT_CORRELATED_JSON,
  DEFAULT_COT_DECISION_JSON,
  DEFAULT_COT_GRAPH_ID,
  DEFAULT_COT_USER_NODE_ID,
  DEFAULT_LLM_SYSTEM_PROMPT,
  DEFAULT_LLM_USER_PROMPT,
  DEFAULT_WHALE_WALLET_SYSTEM_PROMPT,
  DEFAULT_WHALE_WALLET_USER_PROMPT,
} from '@/nodes/constants';

let nodeId = 0;

export function getNodeId(): string {
  nodeId += 1;
  return `node_${nodeId}`;
}

const DEFAULTS: Partial<Record<string, Partial<WorkflowNodeData>>> = {
  llm: {
    apiKey: '',
    model: 'gemini-2.0-flash',
    temperature: '0.7',
    maxTokens: '2048',
    systemPrompt: DEFAULT_LLM_SYSTEM_PROMPT,
    userPrompt: DEFAULT_LLM_USER_PROMPT,
    newsFilterCategories: [],
  },
  newsAgent: { apiKey: '', newsPollLimit: '20' },
  clob: {
    clobMode: 'read',
    clobTokenSource: 'manual',
    executeSide: 'BOTH',
    tokenId: '',
    tradeSize: '',
    tradePrice: '',
    apiKey: '',
    apiSecret: '',
    apiPassphrase: '',
  },
  cotBuilder: {
    graphId: DEFAULT_COT_GRAPH_ID,
    userNodeId: DEFAULT_COT_USER_NODE_ID,
    autoEmit: false,
    decisionJson: DEFAULT_COT_DECISION_JSON,
    correlatedJson: DEFAULT_COT_CORRELATED_JSON,
  },
  whaleWallet: {
    walletAddresses: [''],
    apiKey: '',
    systemPrompt: DEFAULT_WHALE_WALLET_SYSTEM_PROMPT,
    userPrompt: DEFAULT_WHALE_WALLET_USER_PROMPT,
  },
};

export function createNodeData(item: PaletteItem): WorkflowNodeData {
  return {
    label: item.label,
    description: item.description,
    category: item.category,
    accent: item.accent,
    ...DEFAULTS[item.type],
  };
}

export const DND_TYPE = 'application/reactflow';
