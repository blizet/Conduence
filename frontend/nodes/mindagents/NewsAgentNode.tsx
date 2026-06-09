'use client';

import type { NodeProps } from '@xyflow/react';
import { useAgentFeed } from '@/lib/agent-feed';
import { GlassNode } from '../shared/GlassNode';
import { ApiKeyField } from '../shared/ApiKeyField';
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

  const apiKey = data.apiKey ?? getStoredApiKey();

  const toggleStream = () => {
    if (newsStreamRunning) {
      stopNewsStream();
    } else {
      void startNewsStream(apiKey);
    }
  };

  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="mindagent"
      accent={data.accent}
      icon={<NewsIcon />}
      selected={selected}
      wide
      handles={[
        { type: 'target', position: 'left' },
        { type: 'source', position: 'right', id: 'out-news' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <ApiKeyField
          label="CoinDesk API key"
          value={apiKey}
          placeholder="Required — streams via backend wrapper…"
          onChange={(v) => {
            saveApiKey(v);
            updateData({ apiKey: v });
          }}
        />
        <div className="node-field">
          <div className="node-field__label">Autonomous feed</div>
          <div className="node-status-row">
            <span
              className={`node-live-dot${newsStreamRunning ? ' node-live-dot--on' : ''}`}
              style={{ color: newsStreamRunning ? data.accent : undefined }}
            />
            <span className="node-field__hint">
              {newsStreamRunning
                ? `Live · ${feedTopic ?? 'agent.feeds.newsAgent.public'}`
                : 'Start from here or Marketplace (requires backend + Redpanda)'}
            </span>
          </div>
          <button
            type="button"
            className="node-add-btn"
            style={{ marginTop: 4, borderColor: `${data.accent}55`, color: data.accent }}
            onClick={toggleStream}
          >
            {newsStreamRunning ? 'Stop autonomous feed' : 'Start autonomous feed'}
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
            <div className="node-feed-preview">
              <span className="node-feed-preview__sentiment">{latestNews.sentiment}</span>
              {latestNews.categories.slice(0, 2).join(', ')}
              <div className="node-feed-preview__headline">{latestNews.headline}</div>
            </div>
          </div>
        )}
        <div className="node-field__hint">
          Topic agent.feeds.newsAgent.public · subscribers consume this topic only
        </div>
      </div>
    </GlassNode>
  );
}
