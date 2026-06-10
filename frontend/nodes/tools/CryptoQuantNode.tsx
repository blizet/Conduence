'use client';

import { useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { executeToolNode } from '@/lib/workflow-tools';
import { ApiKeyField } from '../shared/ApiKeyField';
import { GlassNode } from '../shared/GlassNode';
import { LabeledInput, LabeledInputRow } from '../shared/LabeledField';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode } from '../types';

function CryptoQuantIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 12l3-3 2 2 4-5 3 3" />
    </svg>
  );
}

export function CryptoQuantNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const updateData = useNodeData(id);
  const [busy, setBusy] = useState(false);

  const runFetch = async () => {
    setBusy(true);
    updateData({ workflowStatus: 'running', workflowError: '', workflowResult: '' });
    try {
      const result = await executeToolNode('cryptoquant', data);
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
      icon={<CryptoQuantIcon />}
      selected={selected}
      wide
      handles={[
        { type: 'target', position: 'left' },
        { type: 'source', position: 'right' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <ApiKeyField
          label="CryptoQuant API key"
          value={data.apiKey ?? ''}
          onChange={(v) => updateData({ apiKey: v })}
        />
        <LabeledInput
          label="Metric path"
          placeholder="btc/exchange-flows/inflow"
          value={data.cryptoquantMetric ?? ''}
          onChange={(v) => updateData({ cryptoquantMetric: v })}
        />
        <LabeledInputRow>
          <LabeledInput
            label="Symbol"
            inline
            placeholder="btc"
            value={data.cryptoquantSymbol ?? ''}
            onChange={(v) => updateData({ cryptoquantSymbol: v })}
          />
          <LabeledInput
            label="Time window"
            inline
            placeholder="day"
            value={data.cryptoquantWindow ?? ''}
            onChange={(v) => updateData({ cryptoquantWindow: v })}
          />
        </LabeledInputRow>
        <LabeledInput
          label="Exchange"
          placeholder="Optional"
          value={data.cryptoquantExchange ?? ''}
          onChange={(v) => updateData({ cryptoquantExchange: v })}
        />
        <button
          type="button"
          className="node-add-btn"
          style={{ borderColor: `${data.accent}55`, color: data.accent, marginTop: 6 }}
          disabled={busy}
          onClick={() => void runFetch()}
        >
          {busy ? 'Fetching…' : 'Fetch CryptoQuant'}
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
