import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { DecisionEventSchema, type DecisionEvent } from '../schemas/decision.schema';
import { PUBLISHER_GRAPH_ID } from './pipeline-config';
import { normalizeDecision } from './normalize';

/** Default CoT decision batch (repo-relative). */
export const DEFAULT_SEED_DELTAS_FILE = 'data/sample/decisions-batch.json';

/** Per-decision JSON files (open/close lifecycle). */
export const DEFAULT_SEED_DECISIONS_DIR = 'data/decisions';

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
      `Set COT_SEED_DELTAS or COT_SEED_DECISIONS_DIR.`,
  );
}

export function resolveDecisionsDir(): string {
  const rel = process.env.COT_SEED_DECISIONS_DIR ?? DEFAULT_SEED_DECISIONS_DIR;
  const found = firstExistingPath(rel);
  if (!found) {
    throw new Error(`Decisions directory not found: ${rel} (cwd=${process.cwd()})`);
  }
  return found;
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

function parseDecisionFile(path: string, index: number, options?: {
  graphId?: string;
  userNodeId?: string;
}): DecisionEvent {
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  const graphId = options?.graphId ?? PUBLISHER_GRAPH_ID;
  const draft = Array.isArray(raw) ? raw[0] : { ...raw, graph_id: graphId };
  if (!Array.isArray(raw)) (draft as DecisionEvent).graph_id = graphId;
  if (options?.userNodeId) remapUserNodeId(draft as DecisionEvent, options.userNodeId);
  const parsed = DecisionEventSchema.parse(draft);
  try {
    return normalizeDecision(parsed);
  } catch (err) {
    throw new Error(`${path} failed: ${err}`);
  }
}

/** Load one JSON file per decision from data/decisions/ (sorted for open-before-close). */
export function loadDecisionFiles(options?: {
  graphId?: string;
  userNodeId?: string;
}): DecisionEvent[] {
  const dir = resolveDecisionsDir();
  const allFiles = readdirSync(dir);
  const openCloseFiles = allFiles.filter((f) => /^dec-trd_\d+-(open|close)\.json$/.test(f));
  const legacyFiles = allFiles.filter((f) => /^dec-trd_\d+\.json$/.test(f));
  const files = (openCloseFiles.length ? openCloseFiles : legacyFiles)
    .sort((a, b) => {
      const openA = a.endsWith('-open.json');
      const openB = b.endsWith('-open.json');
      if (openA !== openB) return openA ? -1 : 1;
      return a.localeCompare(b, undefined, { numeric: true });
    });

  if (files.length === 0) {
    throw new Error(`No dec-trd_*.json files in ${dir}`);
  }

  return files.map((f, i) => parseDecisionFile(join(dir, f), i, options));
}

/**
 * Load seed deltas: prefer data/decisions/*.json when present, else batch array file.
 */
export function loadGeminiDeltas(options?: {
  graphId?: string;
  userNodeId?: string;
}): DecisionEvent[] {
  const dir = process.env.COT_SEED_DECISIONS_DIR ?? DEFAULT_SEED_DECISIONS_DIR;
  const dirPath = firstExistingPath(dir);
  if (dirPath) {
    const hasFiles = readdirSync(dirPath).some((f) =>
      /^dec-trd_\d+(-(open|close))?\.json$/.test(f),
    );
    if (hasFiles) return loadDecisionFiles(options);
  }

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
