'use client';

import { useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { executeToolNode } from '@/lib/workflow-tools';
import { ApiKeyField } from '../shared/ApiKeyField';
import { GlassNode } from '../shared/GlassNode';
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
  const [busy, setBusy] = useState(false);

  const runFetch = async () => {
    setBusy(true);
    updateData({ workflowStatus: 'running', workflowError: '', workflowResult: '' });
    try {
      const result = await executeToolNode('tavily', data);
      updateData({
        workflowStatus: result.ok ? 'success' : 'error',
        workflowError: result.error ?? '',
        workflowResult: JSON.stringify(result, null, 2),
      });
    } catch (err) {
      updateData({
        workflowStatus: 'error',
        workflowError: err instanceof Error ? err.message : 'Request failed',
      });
    } finally {
      setBusy(false);
    }
  };

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
          onChange={(v) => updateData({ apiKey: v })}
        />
        <LabeledTextarea
          label="Search query"
          placeholder="e.g. latest Bitcoin ETF news"
          value={data.tavilyQuery ?? ''}
          onChange={(v) => updateData({ tavilyQuery: v })}
        />
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
        <button
          type="button"
          className="node-add-btn"
          style={{ borderColor: `${data.accent}55`, color: data.accent, marginTop: 6 }}
          disabled={busy}
          onClick={() => void runFetch()}
        >
          {busy ? 'Fetching…' : 'Fetch Tavily'}
        </button>
        {data.workflowStatus && (
          <div className="node-field__hint" style={{ marginTop: 4 }}>
            {data.workflowStatus === 'error' ? data.workflowError : data.workflowStatus}
          </div>
        )}
      </div>
    </GlassNode>
  );
}
