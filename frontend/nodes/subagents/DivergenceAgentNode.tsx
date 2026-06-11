'use client';

import { useEffect } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useAgentFeed } from '@/lib/agent-feed';
import { LlmProviderFields } from '../shared/LlmProviderFields';
import type { LlmProvider } from '@/lib/llm-providers';
import { GlassNode } from '../shared/GlassNode';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode } from '../types';

const AGENT_ID = 'divergenceAgent';

function DivergenceIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 12L6 4l3 4 5-8" />
      <circle cx="14" cy="2" r="1" />
    </svg>
  );
}

export function DivergenceAgentNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const { agentFeeds, startAgent, stopAgent, refreshAgentStatus } = useAgentFeed();
  const updateData = useNodeData(id);

  const feed = agentFeeds[AGENT_ID];
  const running = feed?.running ?? false;
  const latest = feed?.latest as { summary?: string } | null;
  const simulate = data.simulate ?? false;

  useEffect(() => {
    void refreshAgentStatus(AGENT_ID);
  }, [refreshAgentStatus]);

  const toggleStream = () => {
    if (running) {
      stopAgent(AGENT_ID);
    } else {
      void startAgent(AGENT_ID, {
        simulate,
        pollIntervalS: 60,
        llmProvider: data.llmProvider,
        llmApiKey: data.llmApiKey?.trim() || undefined,
        model: data.model,
      });
    }
  };

  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="subagent"
      accent={data.accent}
      icon={<DivergenceIcon />}
      selected={selected}
      wide
      handles={[
        { type: 'target', position: 'left', id: 'in-tools' },
        { type: 'source', position: 'right', id: 'out-div' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <LlmProviderFields
          provider={data.llmProvider}
          model={data.model}
          apiKey={data.llmApiKey}
          apiKeyLabel="LLM API key (optional summaries)"
          onProviderChange={(p: LlmProvider) => updateData({ llmProvider: p })}
          onModelChange={(v) => updateData({ model: v })}
          onApiKeyChange={(v) => updateData({ llmApiKey: v })}
        />
        <div className="node-field">
          <div className="node-field__label">Snap tools (left handle)</div>
          <div className="node-field__hint">CoinGecko + Divergence → watches graph pairs</div>
        </div>
        <div className="node-field">
          <div className="node-field__label">Sub-agent feed</div>
          <div className="node-status-row">
            <span
              className={`node-live-dot${running ? ' node-live-dot--on' : ''}`}
              style={{ color: running ? data.accent : undefined }}
            />
            <span className="node-field__hint">
              {running
                ? `Polling · ${feed?.feedTopic ?? `agent.feeds.${AGENT_ID}.public`}`
                : 'Start to emit divergence.context signals'}
            </span>
          </div>
          <label className="node-checkbox-row nodrag">
            <input
              type="checkbox"
              checked={simulate}
              disabled={running}
              onChange={(e) => updateData({ simulate: e.target.checked })}
            />
            Simulate — replay ZEC/BTC decoupling sample
          </label>
          <button type="button" className="node-btn nodrag" onClick={toggleStream}>
            {running ? 'Stop sub-agent' : 'Start sub-agent'}
          </button>
          {latest?.summary ? (
            <div className="node-field__hint">{latest.summary.slice(0, 100)}…</div>
          ) : null}
          {feed?.error ? <div className="node-field__hint node-field__hint--error">{feed.error}</div> : null}
        </div>
      </div>
    </GlassNode>
  );
}
