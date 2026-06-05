import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { graphIdFor, userSlugFromNodeId } from './graph-topology';
import type { WhaleWalletConfig } from '../agents/types';

export const MAIN_USER_NODE_ID = process.env.MAIN_USER_NODE_ID ?? 'user_771';
export const MAIN_USER_SLUG = userSlugFromNodeId(MAIN_USER_NODE_ID);
export const MAIN_GRAPH_ID =
  process.env.MAIN_GRAPH_ID ?? graphIdFor(MAIN_USER_SLUG, 'main');
export const MAIN_AGENT_ID = `${MAIN_USER_SLUG}.main`;

export const NEWS_POLL_INTERVAL_MS = Number(process.env.NEWS_POLL_INTERVAL_MS ?? 60_000);
export const CORRELATED_MARKETS_LIMIT = Number(process.env.CORRELATED_MARKETS_LIMIT ?? 21);
export const MAIN_AGENT_LOG =
  process.env.MAIN_AGENT_LOG ?? process.env.MAIN_SESSION_JSONL ?? 'data/logs/main-agent.jsonl';
export const COT_API_URL = process.env.COT_API_URL ?? 'http://localhost:4000';
export const MAIN_GEMINI_MIN_INTERVAL_MS = Number(
  process.env.MAIN_GEMINI_MIN_INTERVAL_MS ?? 30_000,
);
export const WHALE_FETCH_DELAY_MS = Number(process.env.WHALE_FETCH_DELAY_MS ?? 800);
export const WHALE_WALLETS_FILE =
  process.env.WHALE_WALLETS_FILE ?? 'config/whale-wallets.json';

const REPO_ROOT_CANDIDATES = [
  process.cwd(),
  join(process.cwd(), '..'),
  join(process.cwd(), '../..'),
];

function firstExistingPath(rel: string): string | null {
  if (existsSync(rel)) return rel;
  for (const root of REPO_ROOT_CANDIDATES) {
    const abs = join(root, rel);
    if (existsSync(abs)) return abs;
  }
  return null;
}

/** Find monorepo root (CoT_kb/) whether cwd is backend/ or repo root. */
export function resolveRepoRoot(): string {
  for (const root of REPO_ROOT_CANDIDATES) {
    const hasWorkspace = existsSync(join(root, 'package.json')) &&
      existsSync(join(root, 'backend', 'package.json'));
    const hasConfig = existsSync(join(root, 'config', 'whale-wallets.json'));
    if (hasWorkspace || hasConfig) return root;
  }
  return process.cwd();
}

/** Resolve a repo-relative output path (works when cwd is backend/ or repo root). */
export function resolveRepoRelativePath(rel: string): string {
  return join(resolveRepoRoot(), rel);
}

export function resolveWhaleWalletsPath(): string {
  const found = firstExistingPath(WHALE_WALLETS_FILE);
  if (!found) {
    throw new Error(`Whale wallets file not found: ${WHALE_WALLETS_FILE}`);
  }
  return found;
}

export function loadWhaleWallets(): WhaleWalletConfig[] {
  const path = resolveWhaleWalletsPath();
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  if (!Array.isArray(raw)) {
    throw new Error(`${path}: expected JSON array of whale wallets`);
  }
  return raw as WhaleWalletConfig[];
}
