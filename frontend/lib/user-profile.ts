import { API_BASE } from '@/lib/cot-graph';
import type { GraphSnapshot } from '@/lib/cot-graph';
import type { WalletCotNodeDetail } from '@/lib/wallet-graph';

const USER_ID_KEY = 'cot_user_id';

export type UserProfile = {
  imported: boolean;
  user_id?: string;
  wallet?: string;
  user_slug?: string;
  graph_id?: string;
  imported_at?: string;
  trade_count?: number;
  import_limit?: number;
  platforms?: string[];
};

const TRADE_LIMIT_MIN = 5;
const TRADE_LIMIT_MAX = 500;
const TRADE_LIMIT_DEFAULT = 100;

export function clampTradeLimit(value: number | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return TRADE_LIMIT_DEFAULT;
  return Math.max(TRADE_LIMIT_MIN, Math.min(TRADE_LIMIT_MAX, Math.round(n)));
}

export { TRADE_LIMIT_MIN, TRADE_LIMIT_MAX, TRADE_LIMIT_DEFAULT };

export type UserCotGraph = {
  graph_id: string;
  user_node_id: string;
  snapshot: GraphSnapshot;
  nodeDetails?: Record<string, WalletCotNodeDetail>;
  stats?: Record<string, number>;
  wallet?: string;
};

export function getOrCreateUserId(): string {
  if (typeof window === 'undefined') return 'anonymous';
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

export async function fetchUserProfile(userId: string): Promise<UserProfile> {
  const res = await fetch(`${API_BASE}/api/user/profile/${encodeURIComponent(userId)}`, {
    cache: 'no-store',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof body?.detail === 'string' ? body.detail : 'Failed to load profile');
  }
  return body as UserProfile;
}

export async function fetchUserCotGraph(userId: string): Promise<UserCotGraph> {
  const res = await fetch(`${API_BASE}/api/user/graph/${encodeURIComponent(userId)}`, {
    cache: 'no-store',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof body?.detail === 'string' ? body.detail : 'Failed to load user graph');
  }
  return (body as { cotGraph: UserCotGraph }).cotGraph;
}

export async function importWallet(input: {
  userId: string;
  wallet: string;
  limit?: number;
}): Promise<{
  profile: UserProfile;
  cotGraph: UserCotGraph;
  tradeCount: number;
  ingestedDecisions: number;
  ingestErrors?: string[];
  errors?: string[];
}> {
  const res = await fetch(`${API_BASE}/api/wallet/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: input.userId,
      wallet: input.wallet,
      limit: clampTradeLimit(input.limit),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof body?.detail === 'string' ? body.detail : 'Wallet import failed');
  }
  return body as {
    profile: UserProfile;
    cotGraph: UserCotGraph;
    tradeCount: number;
    ingestedDecisions: number;
    ingestErrors?: string[];
    errors?: string[];
  };
}
