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

function NewsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <path d="M5 6h6M5 9h4" />
    </svg>
  );
}

export function NewsAgentNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const { latestNews, newsCount, newsStreamRunning, newsStreamError, feedTopic } = useAgentFeed();
  const updateData = useNodeData(id);
  const [workflowLive, setWorkflowLive] = useState(false);

  const llmProvider = normalizeProvider(data.llmProvider);
  const llmApiKey = data.llmApiKey ?? '';
  const llmModel = data.model ?? defaultModelForProvider(llmProvider);
  const llmReady = Boolean(llmProvider && llmApiKey.trim() && llmModel.trim());
  const managedByWorkflow = workflowLive;

  useEffect(() => {
    void fetchWorkflowLiveStatus().then((s) => setWorkflowLive(Boolean(s.running)));
    const t = setInterval(() => {
      void fetchWorkflowLiveStatus().then((s) => setWorkflowLive(Boolean(s.running)));
    }, 8000);
    return () => clearInterval(t);
  }, []);

  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="subagent"
      accent={data.accent}
      icon={<NewsIcon />}
      selected={selected}
      wide
      handles={subagentInputHandles('out-news')}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <div className="node-field">
          <div className="node-field__label">LLM for decision inference</div>
          <div className="node-field__hint">
            Required — sentiment, categories, keywords, thesis (SYSTEM_PROMPT is fixed)
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
          placeholder="e.g. Focus on ETF flows and regulation headlines…"
          onChange={(v) => updateData({ userPrompt: v })}
        />
        <div className="node-field">
          <div className="node-field__label">Sub-agent feed</div>
          <div className="node-status-row">
            <span
              className={`node-live-dot${newsStreamRunning || managedByWorkflow ? ' node-live-dot--on' : ''}`}
              style={{
                color: newsStreamRunning || managedByWorkflow ? data.accent : undefined,
              }}
            />
            <span className="node-field__hint">
              {managedByWorkflow
                ? 'Managed by workflow Go Live'
                : newsStreamRunning
                  ? `Live · ${feedTopic ?? 'agent.feeds.newsAgent.public'}`
                  : llmReady
                    ? 'Use Go Live on the header or Marketplace (legacy Start removed when workflow live)'
                    : 'Set LLM provider, API key, and model'}
            </span>
          </div>
          <label className="node-checkbox-row nodrag">
            <input
              type="checkbox"
              checked={Boolean(data.simulate)}
              disabled={newsStreamRunning || managedByWorkflow}
              onChange={(e) => updateData({ simulate: e.target.checked })}
            />
            Simulate mode — canned headlines, still calls LLM
          </label>
          {newsStreamError && (
            <div className="node-field__hint" style={{ color: '#f87171', marginTop: 4 }}>
              {newsStreamError}
            </div>
          )}
        </div>
        {latestNews && (
          <div className="node-field">
            <div className="node-field__label">Latest signal ({newsCount} total)</div>
            <div className="node-feed-preview nodrag">
              <span className="node-feed-preview__sentiment">{latestNews.sentiment}</span>
              {latestNews.categories.slice(0, 2).join(', ')}
              <div className="node-feed-preview__headline">{latestNews.headline}</div>
            </div>
          </div>
        )}
      </div>
    </GlassNode>
  );
}
