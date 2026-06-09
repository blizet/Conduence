import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { WhaleWalletConfig } from '../types';

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

export function resolveWhaleWalletsPath(): string | null {
  return firstExistingPath(WHALE_WALLETS_FILE);
}

export function loadWhaleWallets(): WhaleWalletConfig[] {
  const path = resolveWhaleWalletsPath();
  if (!path) return [];
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  if (!Array.isArray(raw)) {
    throw new Error(`${path}: expected JSON array of whale wallets`);
  }
  return raw as WhaleWalletConfig[];
}
