import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { DecisionEventSchema, type DecisionEvent } from '../schemas/decision.schema';
import { PUBLISHER_GRAPH_ID } from './pipeline-config';
import { normalizeDecision } from './normalize';

/** Default CoT decision batch (repo-relative). Override with COT_SEED_DELTAS or COT_GEMINI_DELTAS. */
export const DEFAULT_SEED_DELTAS_FILE = 'data/sample/decisions-batch.json';

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

export function resolveGeminiDeltasPath(): string {
  const configured =
    process.env.COT_SEED_DELTAS ??
    process.env.COT_GEMINI_DELTAS ??
    DEFAULT_SEED_DELTAS_FILE;

  const candidates = [configured, DEFAULT_SEED_DELTAS_FILE].filter(
    (p, i, arr) => arr.indexOf(p) === i,
  );

  for (const rel of candidates) {
    const found = firstExistingPath(rel);
    if (found) return found;
  }

  throw new Error(
    `No decision batch found. Tried: ${candidates.join(', ')} (cwd=${process.cwd()}). ` +
      `Set COT_SEED_DELTAS=${DEFAULT_SEED_DELTAS_FILE} or place the file at repo root.`,
  );
}

function remapUserNodeId(payload: DecisionEvent, targetUserId: string): void {
  const user = payload.nodes.find((n) => n.node_type === 'user');
  if (!user || user.node_id === targetUserId) return;
  const from = user.node_id;
  user.node_id = targetUserId;
  for (const edge of payload.edges) {
    if (edge.source === from) edge.source = targetUserId;
    if (edge.target === from) edge.target = targetUserId;
    if (edge.targets) {
      edge.targets = edge.targets.map((t) => (t === from ? targetUserId : t));
    }
  }
}

/**
 * Load CoT deltas from the seed JSON array; normalize to publisher graph topology.
 */
export function loadGeminiDeltas(options?: {
  graphId?: string;
  userNodeId?: string;
}): DecisionEvent[] {
  const path = resolveGeminiDeltasPath();
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  if (!Array.isArray(raw)) {
    throw new Error(`${path}: expected a JSON array of decision deltas`);
  }

  const graphId = options?.graphId ?? PUBLISHER_GRAPH_ID;
  const userNodeId = options?.userNodeId;

  return raw.map((item, index) => {
    const draft = { ...item, graph_id: graphId };
    if (userNodeId) remapUserNodeId(draft as DecisionEvent, userNodeId);
    const parsed = DecisionEventSchema.parse(draft);
    try {
      return normalizeDecision(parsed);
    } catch (err) {
      throw new Error(`Seed delta #${index + 1} (${item.updated_at ?? '?'}) failed: ${err}`);
    }
  });
}
