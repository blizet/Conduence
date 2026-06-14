'use client';

import { useEffect, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useAgentFeed } from '@/lib/agent-feed';
import {
  defaultModelForProvider,
  normalizeProvider,
  type LlmProvider,
} from '@/lib/llm-providers';
import { fetchWorkflowLiveStatus } from '@/lib/workflow-live';
import { subagentInputHandles } from '../shared/agentInputHandles';
import { GlassNode } from '../shared/GlassNode';
import { LlmProviderFields } from '../shared/LlmProviderFields';
import { PromptField } from '../shared/PromptField';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode } from '../types';

const AGENT_ID = 'arbitrageAgent';

type ArbitrageEvent = {
  summary?: string;
  thesis?: string;
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
  const { agentFeeds, refreshAgentStatus } = useAgentFeed();
  const updateData = useNodeData(id);
  const [workflowLive, setWorkflowLive] = useState(false);

  const feed = agentFeeds[AGENT_ID];
  const running = feed?.running ?? false;
  const latest = isArbitrageEvent(feed?.latest) ? feed.latest : null;
  const simulate = data.simulate ?? false;

  const llmProvider = normalizeProvider(data.llmProvider);
  const llmApiKey = data.llmApiKey ?? '';
  const llmModel = data.model ?? defaultModelForProvider(llmProvider);
  const llmReady = Boolean(llmProvider && llmApiKey.trim() && llmModel.trim());

  useEffect(() => {
    void refreshAgentStatus(AGENT_ID);
    void fetchWorkflowLiveStatus().then((s) => setWorkflowLive(Boolean(s.running)));
    const t = setInterval(() => {
      void fetchWorkflowLiveStatus().then((s) => setWorkflowLive(Boolean(s.running)));
    }, 8000);
    return () => clearInterval(t);
  }, [refreshAgentStatus]);

  const managedByWorkflow = workflowLive;

  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="subagent"
      accent={data.accent}
      icon={<ArbIcon />}
      selected={selected}
      wide
      handles={subagentInputHandles('out-arb')}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <div className="node-field">
          <div className="node-field__label">LLM for same-event verification</div>
          <div className="node-field__hint">
            Required — used to verify that two markets resolve on the same fact and to write the thesis
          </div>
        </div>
        <LlmProviderFields
          provider={llmProvider}
          model={llmModel}
          apiKey={llmApiKey}
          apiKeyLabel="LLM API key"
          onProviderChange={(p: LlmProvider) =>
            updateData({ llmProvider: p, model: defaultModelForProvider(p) })
          }
          onModelChange={(m) => updateData({ model: m })}
          onApiKeyChange={(k) => updateData({ llmApiKey: k })}
        />
        <PromptField
          label="User prompt (strategy focus)"
          value={data.userPrompt ?? ''}
          rows={2}
          placeholder="e.g. Only crypto threshold markets with >$50K liquidity…"
          onChange={(v) => updateData({ userPrompt: v })}
        />
        <div className="node-field">
          <div className="node-field__label">Polymarket × Kalshi scanner</div>
          <div className="node-status-row">
            <span
              className={`node-live-dot${running || managedByWorkflow ? ' node-live-dot--on' : ''}`}
              style={{ color: running || managedByWorkflow ? data.accent : undefined }}
            />
            <span className="node-field__hint">
              {managedByWorkflow
                ? 'Managed by workflow Go Live'
                : running
                  ? `Live · ${feed?.feedTopic ?? 'agent.feeds.arbitrageAgent.public'}`
                  : llmReady
                    ? 'Use Go Live on the header to start scanning'
                    : 'Set LLM provider, API key, and model to enable'}
            </span>
          </div>
          <label className="node-checkbox-row nodrag">
            <input
              type="checkbox"
              checked={simulate}
              disabled={running || managedByWorkflow}
              onChange={(e) => updateData({ simulate: e.target.checked })}
            />
            Simulate mode — offline fixtures, still calls LLM
          </label>
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
              {latest.thesis && (
                <div className="node-field__hint" style={{ marginTop: 4 }}>{latest.thesis}</div>
              )}
            </div>
          </div>
        )}
        <div className="node-field__hint">
          Gates: same event (LLM) · exact thresholds · ask-priced legs · fees · net edge ≥ 1.5c
        </div>
      </div>
    </GlassNode>
  );
}
