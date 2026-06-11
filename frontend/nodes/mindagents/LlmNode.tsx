'use client';

import type { NodeProps } from '@xyflow/react';
import { DEFAULT_LLM_SYSTEM_PROMPT, DEFAULT_LLM_USER_PROMPT } from '../constants';
import { GlassNode } from '../shared/GlassNode';
import { LlmProviderFields } from '../shared/LlmProviderFields';
import type { LlmProvider } from '@/lib/llm-providers';
import { PromptField } from '../shared/PromptField';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import { LLM_INPUT_COUNT, LLM_OUTPUT_COUNT, MARKET_CATEGORIES, type WorkflowNode } from '../types';
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

function buildMultiHandles(
  type: 'source' | 'target',
  position: 'left' | 'right',
  count: number,
  prefix: string,
): { type: 'source' | 'target'; position: 'left' | 'right'; id: string; style: React.CSSProperties }[] {
  return Array.from({ length: count }, (_, i) => {
    const pct = ((i + 1) / (count + 1)) * 100;
    return {
      type,
      position,
      id: `${prefix}-${i}`,
      style: { top: `${pct}%` },
    };
  });
}

export function LlmNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const updateData = useNodeData(id);
  const { filterByCategories } = useAgentFeed();
  const inputHandles = buildMultiHandles('target', 'left', LLM_INPUT_COUNT, 'in');
  const outputHandles = buildMultiHandles('source', 'right', LLM_OUTPUT_COUNT, 'out');
  const newsFilterCategories = data.newsFilterCategories ?? [];
  const filteredNews = filterByCategories(newsFilterCategories);

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
      category="mindagent"
      accent={data.accent}
      icon={<LlmIcon />}
      selected={selected}
      wide
      handles={[...inputHandles, ...outputHandles]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
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
          rows={4}
          onChange={(v) => updateData({ systemPrompt: v })}
        />
        <PromptField
          label="User prompt"
          value={data.userPrompt ?? DEFAULT_LLM_USER_PROMPT}
          rows={3}
          onChange={(v) => updateData({ userPrompt: v })}
        />
        <div className="node-field">
          <div className="node-field__label">News feed filter (event bus)</div>
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
              ? 'All categories · connect News Agent for live intake'
              : filteredNews
                ? `Matched: ${filteredNews.headline.slice(0, 60)}…`
                : 'No matching news in stream yet'}
          </div>
        </div>
        <div className="node-field">
          <div className="node-field__hint">
            {LLM_INPUT_COUNT} in · {LLM_OUTPUT_COUNT} out · LangGraph orchestrator
          </div>
          {data.workflowStatus && data.workflowStatus !== 'idle' ? (
            <div className={`node-field__hint node-field__hint--${data.workflowStatus}`}>
              {data.workflowStatus === 'running'
                ? 'Orchestrator running…'
                : data.workflowStatus === 'success'
                  ? 'Orchestrator complete — see result below'
                  : `Error: ${data.workflowError || 'orchestrator failed'}`}
            </div>
          ) : null}
          {data.workflowResult ? (
            <PromptField
              label="Orchestrator result"
              value={data.workflowResult}
              rows={4}
              onChange={() => {}}
            />
          ) : null}
        </div>
      </div>
    </GlassNode>
  );
}
