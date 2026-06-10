'use client';

import { useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { executeToolNode } from '@/lib/workflow-tools';
import { ApiKeyField } from '../shared/ApiKeyField';
import { GlassNode } from '../shared/GlassNode';
import { LabeledInput, LabeledInputRow } from '../shared/LabeledField';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode } from '../types';

function CoinMarketCapIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2.5 8a5.5 5.5 0 1 1 11 0" />
      <path d="M8 5v4m0 0l2-2m-2 2L6 7" />
    </svg>
  );
}

export function CoinMarketCapNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const updateData = useNodeData(id);
  const [busy, setBusy] = useState(false);

  const runFetch = async () => {
    setBusy(true);
    updateData({ workflowStatus: 'running', workflowError: '', workflowResult: '' });
    try {
      const result = await executeToolNode('coinmarketcap', data);
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
      icon={<CoinMarketCapIcon />}
      selected={selected}
      wide
      handles={[
        { type: 'target', position: 'left' },
        { type: 'source', position: 'right' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <ApiKeyField
          label="CoinMarketCap API key"
          value={data.apiKey ?? ''}
          onChange={(v) => updateData({ apiKey: v })}
        />
        <LabeledInputRow>
          <LabeledInput
            label="Symbols"
            inline
            placeholder="BTC,ETH"
            value={data.cmcSymbols ?? ''}
            onChange={(v) => updateData({ cmcSymbols: v })}
          />
          <LabeledInput
            label="Convert to"
            inline
            placeholder="USD"
            value={data.cmcConvert ?? ''}
            onChange={(v) => updateData({ cmcConvert: v })}
          />
        </LabeledInputRow>
        <button
          type="button"
          className="node-add-btn"
          style={{ borderColor: `${data.accent}55`, color: data.accent }}
          disabled={busy}
          onClick={() => void runFetch()}
        >
          {busy ? 'Fetching…' : 'Fetch CoinMarketCap'}
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
