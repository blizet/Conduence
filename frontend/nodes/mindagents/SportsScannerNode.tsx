'use client';

import { useEffect } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useAgentFeed } from '@/lib/agent-feed';
import { GlassNode } from '../shared/GlassNode';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode } from '../types';

const AGENT_ID = 'sportsScanner.user_demo';

type SportsSignal = {
  type?: string;
  ticker?: string;
  thesis?: string;
  summary?: string;
  side_team?: string;
  filter_report?: string[];
};

function SportsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M3.5 8h9M8 3.5a5.5 5.5 0 010 9M8 3.5a5.5 5.5 0 000 9" />
    </svg>
  );
}

function isSportsSignal(value: unknown): value is SportsSignal {
  return Boolean(value) && typeof value === 'object';
}

export function SportsScannerNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const { agentFeeds, refreshAgentStatus } = useAgentFeed();
  useNodeData(id);

  const feed = agentFeeds[AGENT_ID];
  const live = feed?.running ?? false;
  const latest = isSportsSignal(feed?.latest) ? feed.latest : null;

  useEffect(() => {
    void refreshAgentStatus(AGENT_ID);
    const timer = setInterval(() => void refreshAgentStatus(AGENT_ID), 10000);
    return () => clearInterval(timer);
  }, [refreshAgentStatus]);

  return (
    <GlassNode
      label={data.label}
      description={data.description ?? 'External · Kalshi soccer feed via HTTP wrapper'}
      category="mindagent"
      accent={data.accent ?? '#4ade80'}
      icon={<SportsIcon />}
      selected={selected}
      wide
      shape="agent"
      handles={[
        { type: 'target', position: 'left' },
        { type: 'source', position: 'right', id: 'out-sports' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
      <div className="node-panel-section">
        <div className="node-status-row">
          <span className={`node-pill ${live ? 'node-pill--live' : 'node-pill--idle'}`}>
            {live ? 'Live · receiving' : 'Offline · waiting for publisher'}
          </span>
          {feed?.count ? <span className="node-meta">{feed.count} signals</span> : null}
        </div>
        {latest ? (
          <div className="node-feed-preview">
            <p className="node-feed-preview__title">
              {latest.ticker ?? '—'} · {latest.type ?? 'signal'}
              {latest.side_team ? ` · ${latest.side_team}` : ''}
            </p>
            <p className="node-feed-preview__body">
              {latest.thesis ?? latest.summary ?? 'No thesis on last signal'}
            </p>
            {latest.filter_report?.length ? (
              <ul className="node-feed-preview__list">
                {latest.filter_report.slice(0, 3).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="node-hint">
            Publisher runs kalshiSports with the HTTP wrapper. Install from marketplace to subscribe.
          </p>
        )}
      </div>
      </div>
    </GlassNode>
  );
}
