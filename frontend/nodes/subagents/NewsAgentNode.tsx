'use client';

import type { NodeProps } from '@xyflow/react';
import { useAgentFeed } from '@/lib/agent-feed';
import {
  defaultModelForProvider,
  normalizeProvider,
  type LlmProvider,
} from '@/lib/llm-providers';
import { GlassNode } from '../shared/GlassNode';
import { ApiKeyField } from '../shared/ApiKeyField';
import { LlmProviderFields } from '../shared/LlmProviderFields';
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
  const {
    latestNews,
    newsCount,
    newsStreamRunning,
    newsStreamError,
    feedTopic,
    startNewsStream,
    stopNewsStream,
    saveApiKey,
    getStoredApiKey,
  } = useAgentFeed();
  const updateData = useNodeData(id);

  const coindeskKey = data.apiKey ?? getStoredApiKey();
  const llmProvider = normalizeProvider(data.llmProvider);
  const llmApiKey = data.llmApiKey ?? '';
  const llmModel = data.model ?? defaultModelForProvider(llmProvider);

  const llmReady = Boolean(llmProvider && llmApiKey.trim() && llmModel.trim());
  const canStart = llmReady && (data.simulate || coindeskKey);

  const toggleStream = () => {
    if (newsStreamRunning) {
      stopNewsStream();
    } else if (canStart) {
      void startNewsStream(coindeskKey, {
        simulate: Boolean(data.simulate),
        llmProvider,
        llmApiKey,
        model: llmModel,
      });
    }
  };

  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="subagent"
      accent={data.accent}
      icon={<NewsIcon />}
      selected={selected}
      wide
      handles={[
        { type: 'target', position: 'left', id: 'in-tools' },
        { type: 'source', position: 'right', id: 'out-news' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <div className="node-field">
          <div className="node-field__label">Required tools (optional snap)</div>
          <div className="node-field__hint">
            CoinDesk Data (this node) · CryptoNews API + Tavily (left handle) for enrichment
          </div>
        </div>
        <ApiKeyField
          label="CoinDesk Data API key"
          value={coindeskKey}
          placeholder="Data feed key (not OpenAI/Gemini/Claude)…"
          onChange={(v) => {
            saveApiKey(v);
            updateData({ apiKey: v });
          }}
        />
        <div className="node-field">
          <div className="node-field__label">LLM for decision inference</div>
          <div className="node-field__hint">
            Required — used to infer sentiment, categories, keywords, thesis, direction, strength
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
        <div className="node-field">
          <div className="node-field__label">Sub-agent feed</div>
          <div className="node-status-row">
            <span
              className={`node-live-dot${newsStreamRunning ? ' node-live-dot--on' : ''}`}
              style={{ color: newsStreamRunning ? data.accent : undefined }}
            />
            <span className="node-field__hint">
              {newsStreamRunning
                ? `Live · ${feedTopic ?? 'agent.feeds.newsAgent.public'}`
                : llmReady
                  ? 'Start from here or Marketplace (requires backend + Redpanda)'
                  : 'Set LLM provider, API key, and model to enable'}
            </span>
          </div>
          <label className="node-checkbox-row nodrag">
            <input
              type="checkbox"
              checked={Boolean(data.simulate)}
              disabled={newsStreamRunning}
              onChange={(e) => updateData({ simulate: e.target.checked })}
            />
            Simulate mode — uses canned headlines, still calls LLM
          </label>
          <button
            type="button"
            className="node-add-btn"
            style={{ marginTop: 4, borderColor: `${data.accent}55`, color: data.accent }}
            onClick={toggleStream}
            disabled={!newsStreamRunning && !canStart}
          >
            {newsStreamRunning
              ? 'Stop sub-agent'
              : llmReady
                ? data.simulate
                  ? 'Start sub-agent (simulated)'
                  : 'Start sub-agent'
                : 'Configure LLM first'}
          </button>
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
