'use client';

import { useEffect } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useAgentFeed } from '@/lib/agent-feed';
import { GlassNode } from '../shared/GlassNode';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode } from '../types';

const AGENT_ID = 'arbitrageAgent';

type ArbitrageEvent = {
  summary?: string;
  opportunity?: {
    net_edge?: number;
    net_edge_pct?: number;
    match_confidence?: number;
    max_size_usd?: number;
  };
};

function ArbIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M8 2.5v11M5.5 13.5h5" />
      <path d="M3.5 4.5h9" />
      <path d="M3.5 4.5L2 8.5h3L3.5 4.5z" />
      <path d="M12.5 4.5L11 8.5h3l-1.5-4z" />
    </svg>
  );
}

function isArbitrageEvent(value: unknown): value is ArbitrageEvent {
  return Boolean(value) && typeof value === 'object' && 'summary' in (value as object);
}

export function ArbitrageAgentNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const { agentFeeds, startAgent, stopAgent, refreshAgentStatus } = useAgentFeed();
  const updateData = useNodeData(id);

  const feed = agentFeeds[AGENT_ID];
  const running = feed?.running ?? false;
  const latest = isArbitrageEvent(feed?.latest) ? feed.latest : null;
  const simulate = data.simulate ?? false;

  useEffect(() => {
    void refreshAgentStatus(AGENT_ID);
  }, [refreshAgentStatus]);

  const toggleStream = () => {
    if (running) {
      stopAgent(AGENT_ID);
    } else {
      void startAgent(AGENT_ID, { simulate });
    }
  };

  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="mindagent"
      accent={data.accent}
      icon={<ArbIcon />}
      selected={selected}
      wide
      handles={[
        { type: 'target', position: 'left' },
        { type: 'source', position: 'right', id: 'out-arb' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <div className="node-field">
          <div className="node-field__label">Polymarket × Kalshi scanner</div>
          <div className="node-field__hint">Public venue APIs — no LLM provider or API key</div>
          <div className="node-status-row">
            <span
              className={`node-live-dot${running ? ' node-live-dot--on' : ''}`}
              style={{ color: running ? data.accent : undefined }}
            />
            <span className="node-field__hint">
              {running
                ? `Live · ${feed?.feedTopic ?? 'agent.feeds.arbitrageAgent.public'}`
                : 'Scans both venues in parallel (requires backend + Redpanda)'}
            </span>
          </div>
          <label className="node-checkbox-row nodrag">
            <input
              type="checkbox"
              checked={simulate}
              disabled={running}
              onChange={(e) => updateData({ simulate: e.target.checked })}
            />
            Simulate mode — offline fixtures, no network
          </label>
          <button
            type="button"
            className="node-add-btn"
            style={{ marginTop: 4, borderColor: `${data.accent}55`, color: data.accent }}
            onClick={toggleStream}
          >
            {running ? 'Stop scanner' : simulate ? 'Start scanner (simulated)' : 'Start scanner'}
          </button>
          {feed?.error && (
            <div className="node-field__hint" style={{ color: '#f87171', marginTop: 4 }}>
              {feed.error}
            </div>
          )}
        </div>
        {latest && (
          <div className="node-field">
            <div className="node-field__label">
              Latest opportunity ({feed?.count ?? 0} total)
            </div>
            <div className="node-feed-preview nodrag">
              {latest.opportunity && (
                <span className="node-feed-preview__sentiment">
                  +{((latest.opportunity.net_edge ?? 0) * 100).toFixed(1)}c · conf{' '}
                  {latest.opportunity.match_confidence ?? '—'}
                </span>
              )}
              <div className="node-feed-preview__headline">{latest.summary}</div>
            </div>
          </div>
        )}
        <div className="node-field__hint">
          Gates: same event · exact thresholds · ask-priced legs · fees · net edge ≥ 1.5c
        </div>
      </div>
    </GlassNode>
  );
}
