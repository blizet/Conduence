'use client';

import type { NodeProps } from '@xyflow/react';
import { GlassNode } from '../shared/GlassNode';
import { ApiKeyField } from '../shared/ApiKeyField';
import { LabeledInput, LabeledInputRow, LabeledSelect, LabeledTextarea } from '../shared/LabeledField';
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
        <ApiKeyField
          label="Tavily API key"
          value={data.apiKey ?? ''}
          onChange={(apiKey) =>
            updateData({ apiKey, toolAccessMode: 'private', toolEndpoint: 'search' })
          }
        />
        <LabeledTextarea
          label="Search query"
          placeholder="e.g. latest Bitcoin ETF regulatory news"
          value={data.tavilyQuery ?? ''}
          onChange={(v) => updateData({ tavilyQuery: v })}
        />
        <LabeledInputRow>
          <LabeledSelect
            label="Depth"
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
      </div>
    </GlassNode>
  );
}
