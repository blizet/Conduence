'use client';

import type { NodeProps } from '@xyflow/react';
import { DEFAULT_LLM_SYSTEM_PROMPT, DEFAULT_LLM_USER_PROMPT, DEFAULT_COT_GRAPH_ID } from '../constants';
import { orchestratorInputHandles } from '../shared/agentInputHandles';
import { GlassNode } from '../shared/GlassNode';
import { LlmProviderFields } from '../shared/LlmProviderFields';
import type { LlmProvider } from '@/lib/llm-providers';
import { FetchResultPanel } from '../shared/FetchResultPanel';
import { PromptField } from '../shared/PromptField';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import { LLM_OUTPUT_COUNT, MARKET_CATEGORIES, type WorkflowNode } from '../types';
import { useAgentFeed } from '@/lib/agent-feed';

function LlmIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="5" />
      <path d="M8 5v3l2 2" />
      <path d="M5 3L3 1M11 3l2-2M5 13l-2 2M11 13l2 2" />
    </svg>
  );
}

export function LlmNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const updateData = useNodeData(id);
  const { filterByCategories } = useAgentFeed();
  const newsFilterCategories = data.newsFilterCategories ?? [];
  const filteredNews = filterByCategories(newsFilterCategories);
  const contextGraph = data.contextGraph ?? 'correlation';
  const graphId = data.graphId ?? DEFAULT_COT_GRAPH_ID;

  const toggleNewsCategory = (category: string) => {
    const next = newsFilterCategories.includes(category)
      ? newsFilterCategories.filter((c) => c !== category)
      : [...newsFilterCategories, category];
    updateData({ newsFilterCategories: next });
  };

  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="orchestrator"
      accent={data.accent}
      icon={<LlmIcon />}
      selected={selected}
      wide
      handles={orchestratorInputHandles(LLM_OUTPUT_COUNT)}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <div className="node-field">
          <div className="node-field__hint">
            Context: {contextGraph}
            {contextGraph === 'decision' ? ` · ${graphId}` : ''}
          </div>
        </div>
        <LlmProviderFields
          provider={data.llmProvider}
          model={data.model}
          apiKey={data.apiKey}
          temperature={data.temperature}
          maxTokens={data.maxTokens}
          showSampling
          onProviderChange={(p: LlmProvider) => updateData({ llmProvider: p })}
          onModelChange={(v) => updateData({ model: v })}
          onApiKeyChange={(v) => updateData({ apiKey: v })}
          onTemperatureChange={(v) => updateData({ temperature: v })}
          onMaxTokensChange={(v) => updateData({ maxTokens: v })}
        />
        <PromptField
          label="System prompt"
          value={data.systemPrompt ?? DEFAULT_LLM_SYSTEM_PROMPT}
          rows={3}
          onChange={(v) => updateData({ systemPrompt: v })}
        />
        <PromptField
          label="User prompt"
          value={data.userPrompt ?? DEFAULT_LLM_USER_PROMPT}
          rows={2}
          onChange={(v) => updateData({ userPrompt: v })}
        />
        <div className="node-field">
          <div className="node-field__label">News filter</div>
          <div className="node-chips">
            {MARKET_CATEGORIES.map((category) => {
              const active = newsFilterCategories.includes(category);
              return (
                <button
                  key={category}
                  type="button"
                  className={`node-chip${active ? ' node-chip--active' : ''}`}
                  style={
                    active
                      ? {
                          borderColor: data.accent,
                          background: `${data.accent}22`,
                          color: data.accent,
                        }
                      : undefined
                  }
                  onClick={() => toggleNewsCategory(category)}
                >
                  {category}
                </button>
              );
            })}
          </div>
          <div className="node-field__hint">
            {newsFilterCategories.length === 0
              ? 'All categories'
              : filteredNews
                ? `Matched: ${filteredNews.headline.slice(0, 48)}…`
                : 'No match in stream yet'}
          </div>
        </div>
        <FetchResultPanel
          status={data.workflowStatus}
          error={data.workflowError}
          result={data.workflowResult}
          durationMs={data.workflowDurationMs}
          label="Orchestrator result"
        />
      </div>
    </GlassNode>
  );
}
