import { describe, expect, it } from 'vitest';
import type { DecisionEvent } from '../schemas/decision.schema';
import {
  computeGraphDelta,
  edgeKey,
  expandEdgeOperations,
  snapshotFromRows,
} from './graph-delta';

describe('graph-delta', () => {
  it('dedupes bi-directional and explicit reverse edges in payload', () => {
    const edges = [
      {
        source: 'PM_A',
        targets: ['PM_B'],
        direction: 'bi-directional' as const,
        relationship_type: 'CORRELATED_MARKET',
        metadata: { relationship_type: 'correlated_market' },
      },
      {
        source: 'PM_B',
        target: 'PM_A',
        relationship_type: 'CORRELATED_MARKET',
        metadata: { relationship_type: 'correlated_market', direction: 'reverse' },
      },
    ];
    const ops = expandEdgeOperations(edges);
    const keys = ops.map((o) => edgeKey(o.source, o.relType, o.target));
    expect(keys).toHaveLength(2);
    expect(keys).toContain(edgeKey('PM_A', 'CORRELATED_MARKET', 'PM_B'));
    expect(keys).toContain(edgeKey('PM_B', 'CORRELATED_MARKET', 'PM_A'));
  });

  it('scopes shared feedback/outcome per trade during normalize', async () => {
    const { normalizeDecision } = await import('../lib/normalize');
    const payload = {
      schema_version: '1.0',
      operation: 'assert' as const,
      graph_id: 'user_117.publisher.v1',
      updated_at: '2026-06-04T10:00:00Z',
      nodes: [
        { node_id: 'user_117', node_type: 'user' as const },
        { node_id: 'Polymarket', node_type: 'protocol' as const },
        { node_id: 'PM_ETH_5K', node_type: 'market' as const },
        { node_id: 'TRD_001', node_type: 'trade' as const },
        { node_id: 'OUT_YES_SHARES', node_type: 'outcome' as const },
        { node_id: 'FB_OPEN', node_type: 'feedback' as const },
      ],
      edges: [
        { source: 'user_117', target: 'Polymarket' },
        { source: 'Polymarket', target: 'PM_ETH_5K' },
        { source: 'PM_ETH_5K', target: 'TRD_001', Action: 'Buy YES' },
        { source: 'TRD_001', target: 'OUT_YES_SHARES' },
        { source: 'TRD_001', target: 'FB_OPEN' },
      ],
    };
    const normalized = normalizeDecision(payload);
    expect(normalized.nodes.some((n) => n.node_id === 'FB_OPEN__TRD_001')).toBe(true);
    expect(normalized.nodes.some((n) => n.node_id === 'OUT_YES_SHARES__TRD_001')).toBe(true);
    expect(normalized.edges.some((e) => e.target === 'FB_OPEN__TRD_001')).toBe(true);
  });

  it('skips nodes and edges already in snapshot on second ingest', () => {
    const payload: DecisionEvent = {
      schema_version: '1.0',
      operation: 'assert',
      graph_id: 'user_117.publisher.v1',
      updated_at: '2026-06-04T10:00:00Z',
      nodes: [
        { node_id: 'user_117', node_type: 'user' },
        { node_id: 'TRD_001', node_type: 'trade' },
      ],
      edges: [
        { source: 'user_117', target: 'TRD_001', relationship_type: 'CONNECTED_TO' },
      ],
    };

    const first = computeGraphDelta(snapshotFromRows([], []), payload);
    expect(first.stats.nodesNew).toBe(2);
    expect(first.stats.edgeOpsNew).toBe(1);

    const snap = snapshotFromRows(
      [{ id: 'user_117' }, { id: 'TRD_001' }],
      [{ source: 'user_117', target: 'TRD_001', type: 'CONNECTED_TO' }],
    );
    const second = computeGraphDelta(snap, payload);
    expect(second.stats.nodesNew).toBe(0);
    expect(second.stats.edgeOpsNew).toBe(0);
    expect(second.stats.nodesSkipped).toBe(2);
    expect(second.stats.edgeOpsSkipped).toBe(1);
  });
});
