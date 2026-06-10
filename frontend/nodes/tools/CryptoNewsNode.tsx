'use client';

import { useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { executeToolNode } from '@/lib/workflow-tools';
import { ApiKeyField } from '../shared/ApiKeyField';
import { GlassNode } from '../shared/GlassNode';
import { LabeledInput, LabeledInputRow } from '../shared/LabeledField';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode } from '../types';

function CryptoNewsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 4h12v8H2z" />
      <path d="M5 7h6M5 9h4" />
    </svg>
  );
}

export function CryptoNewsNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const updateData = useNodeData(id);
  const [busy, setBusy] = useState(false);

  const runFetch = async () => {
    setBusy(true);
    updateData({ workflowStatus: 'running', workflowError: '', workflowResult: '' });
    try {
      const result = await executeToolNode('cryptonews', data);
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
      icon={<CryptoNewsIcon />}
      selected={selected}
      wide
      handles={[
        { type: 'target', position: 'left' },
        { type: 'source', position: 'right' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <ApiKeyField
          label="CryptoNews API key"
          value={data.apiKey ?? ''}
          onChange={(v) => updateData({ apiKey: v })}
        />
        <LabeledInputRow>
          <LabeledInput
            label="Tickers"
            inline
            placeholder="BTC,ETH"
            value={data.cryptonewsTickers ?? ''}
            onChange={(v) => updateData({ cryptonewsTickers: v })}
          />
          <LabeledInput
            label="Article count"
            inline
            placeholder="10"
            value={data.cryptonewsItems ?? ''}
            onChange={(v) => updateData({ cryptonewsItems: v })}
          />
        </LabeledInputRow>
        <LabeledInputRow>
          <LabeledInput
            label="Sentiment filter"
            inline
            placeholder="Optional"
            value={data.cryptonewsSentiment ?? ''}
            onChange={(v) => updateData({ cryptonewsSentiment: v })}
          />
          <LabeledInput
            label="Keywords"
            inline
            placeholder="Optional"
            value={data.cryptonewsKeywords ?? ''}
            onChange={(v) => updateData({ cryptonewsKeywords: v })}
          />
        </LabeledInputRow>
        <button
          type="button"
          className="node-add-btn"
          style={{ borderColor: `${data.accent}55`, color: data.accent, marginTop: 6 }}
          disabled={busy}
          onClick={() => void runFetch()}
        >
          {busy ? 'Fetching…' : 'Fetch CryptoNews'}
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
