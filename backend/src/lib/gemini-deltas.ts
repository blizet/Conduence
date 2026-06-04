import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { DecisionEventSchema, type DecisionEvent } from '../schemas/decision.schema';
import { PUBLISHER_GRAPH_ID } from './pipeline-config';
import { normalizeDecision } from './normalize';

/** Default Gemini CoT batch at repo root (override with COT_GEMINI_DELTAS). */
export const DEFAULT_GEMINI_DELTAS_FILE = 'gemini-code-1780575064729.json';

export function resolveGeminiDeltasPath(): string {
  const rel = process.env.COT_GEMINI_DELTAS ?? DEFAULT_GEMINI_DELTAS_FILE;
  if (existsSync(rel)) return rel;
  const fromRepoRoot = join(process.cwd(), rel);
  if (existsSync(fromRepoRoot)) return fromRepoRoot;
  const fromBackend = join(process.cwd(), '..', rel);
  if (existsSync(fromBackend)) return fromBackend;
  return rel;
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
 * Load CoT deltas from the Gemini JSON array; normalize to publisher graph topology.
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
      throw new Error(`Gemini delta #${index + 1} (${item.updated_at ?? '?'}) failed: ${err}`);
    }
  });
}
