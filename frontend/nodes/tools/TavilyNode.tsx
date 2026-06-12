'use client';

import type { NodeProps } from '@xyflow/react';
import { FetchResultPanel } from '../shared/FetchResultPanel';
import { GlassNode } from '../shared/GlassNode';
import { useToolFetch } from '../shared/useToolFetch';
import { LabeledInput, LabeledInputRow, LabeledSelect, LabeledTextarea } from '../shared/LabeledField';
import { ToolAccessFields } from '../shared/ToolAccessFields';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode } from '../types';

function TavilyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="7" cy="7" r="4" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

export function TavilyNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const updateData = useNodeData(id);
  const { busy, runFetch } = useToolFetch('tavily', data, updateData);
  const endpoint = data.toolEndpoint ?? 'search';

  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="tool"
      accent={data.accent}
      icon={<TavilyIcon />}
      selected={selected}
      wide
      handles={[
        { type: 'target', position: 'left' },
        { type: 'source', position: 'right' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <ToolAccessFields
          toolId="tavily"
          accessMode={data.toolAccessMode ?? 'private'}
          endpoint={endpoint}
          apiKey={data.apiKey ?? ''}
          onAccessModeChange={(toolAccessMode) => updateData({ toolAccessMode })}
          onEndpointChange={(toolEndpoint) => updateData({ toolEndpoint })}
          onApiKeyChange={(apiKey) => updateData({ apiKey })}
        />
        {endpoint === 'search' ? (
          <LabeledTextarea
            label="Search query"
            placeholder="e.g. latest Bitcoin ETF news"
            value={data.tavilyQuery ?? ''}
            onChange={(v) => updateData({ tavilyQuery: v })}
          />
        ) : (
          <LabeledInput
            label="URLs (comma-separated)"
            placeholder="https://example.com/article"
            value={data.tavilyUrls ?? ''}
            onChange={(v) => updateData({ tavilyUrls: v })}
          />
        )}
        {endpoint === 'search' && (
          <LabeledInputRow>
            <LabeledSelect
              label="Search depth"
              inline
              value={data.tavilySearchDepth ?? 'basic'}
              options={[
                { value: 'basic', label: 'Basic' },
                { value: 'advanced', label: 'Advanced' },
              ]}
              onChange={(v) => updateData({ tavilySearchDepth: v as 'basic' | 'advanced' })}
            />
            <LabeledInput
              label="Max results"
              inline
              placeholder="5"
              value={data.tavilyMaxResults ?? ''}
              onChange={(v) => updateData({ tavilyMaxResults: v })}
            />
          </LabeledInputRow>
        )}
        <button
          type="button"
          className="node-add-btn"
          style={{ borderColor: `${data.accent}55`, color: data.accent, marginTop: 6 }}
          disabled={busy}
          onClick={() => void runFetch()}
        >
          {busy ? 'Fetching…' : 'Fetch Tavily'}
        </button>
        <FetchResultPanel
          status={data.workflowStatus}
          error={data.workflowError}
          result={data.workflowResult}
          durationMs={data.workflowDurationMs}
        />
      </div>
    </GlassNode>
  );
}
