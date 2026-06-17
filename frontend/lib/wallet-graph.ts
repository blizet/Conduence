import { API_BASE } from '@/lib/cot-graph';
import type { GraphSnapshot } from '@/lib/cot-graph';
import type { WeightedGraph } from '@/lib/agentic/types';

export type WalletTrade = {
  platform: string;
  wallet: string;
  title: string;
  side: string;
  outcome: string;
  size?: number | null;
  price?: number | null;
  usd?: number | null;
  timestamp?: string | number | null;
  txHash?: string;
};

export type WalletCotTradeRow = {
  tradeId: string;
  action?: string | null;
  price?: number | null;
  size?: number | null;
  volume?: number | null;
  capital?: number | null;
  timestamp?: string | number | null;
  txHash?: string | null;
  origin?: string;
};

export type WalletCotNodeDetail = {
  nodeType: string;
  origin?: string;
  wallet?: string;
  tradeCount?: number;
  totalVolume?: number;
  totalCapital?: number;
  platforms?: string[];
  platform?: string;
  market?: string;
  marketId?: string;
  categories?: string[];
  trades?: WalletCotTradeRow[];
  tradeId?: string;
  action?: string | null;
  side?: string | null;
  outcome?: string | null;
  price?: number | null;
  size?: number | null;
  volume?: number | null;
  capital?: number | null;
  usd?: number | null;
  timestamp?: string | number | null;
  txHash?: string | null;
  thesis?: string | null;
  outcomeDescription?: string;
  linkedTradeId?: string;
};

export type WalletGraphPreview = {
  ok: boolean;
  wallet: string;
  platforms: string[];
  tradeCount: number;
  trades: WalletTrade[];
  agenticGraph: WeightedGraph & {
    stats?: {
      marketNodes?: number;
      conceptNodes?: number;
      extractedEdges?: number;
      inferredEdges?: number;
    };
  };
  cotGraph: {
    graph_id: string;
    user_node_id: string;
    snapshot: GraphSnapshot;
    nodeDetails?: Record<string, WalletCotNodeDetail>;
    marketCorrelations?: Array<{
      id: string;
      source: string;
      target: string;
      weight?: number;
      label?: string;
    }>;
    stats?: {
      decisionCount?: number;
      nodeCount?: number;
      edgeCount?: number;
      correlationEdges?: number;
    };
  };
  errors?: string[];
};

export async function fetchWalletGraphPreview(input: {
  wallet: string;
  limit?: number;
  kalshiApiKeyId?: string;
  kalshiPrivateKeyPem?: string;
}): Promise<WalletGraphPreview> {
  const response = await fetch(`${API_BASE}/api/wallet/graph-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet: input.wallet,
      limit: input.limit ?? 50,
      kalshiApiKeyId: input.kalshiApiKeyId,
      kalshiPrivateKeyPem: input.kalshiPrivateKeyPem,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload?.detail === 'string' ? payload.detail : response.statusText;
    throw new Error(detail || 'Wallet graph preview failed');
  }
  return payload as WalletGraphPreview;
}
