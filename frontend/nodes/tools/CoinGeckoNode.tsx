'use client';

import { useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { executeToolNode } from '@/lib/workflow-tools';
import { GlassNode } from '../shared/GlassNode';
import { LabeledInput } from '../shared/LabeledField';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode } from '../types';

function CoinGeckoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="6" cy="6.5" r="1.4" fill="currentColor" stroke="none" />
      <path d="M8 11c1.5 0 3-.6 4-1.8" />
    </svg>
  );
}

export function CoinGeckoNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const updateData = useNodeData(id);
  const [busy, setBusy] = useState(false);

  const runFetch = async () => {
    setBusy(true);
    updateData({ workflowStatus: 'running', workflowError: '', workflowResult: '' });
    try {
      const result = await executeToolNode('coingecko', data);
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
      icon={<CoinGeckoIcon />}
      selected={selected}
      wide
      handles={[
        { type: 'target', position: 'left' },
        { type: 'source', position: 'right' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <LabeledInput
          label="CoinGecko IDs (comma-separated)"
          placeholder="bitcoin, ethereum, zcash"
          value={data.coingeckoIds ?? ''}
          onChange={(v) => updateData({ coingeckoIds: v })}
        />
        <div className="node-field__hint" style={{ marginBottom: 4 }}>
          Free API — no key needed · spot price + 24h change
        </div>
        <button
          type="button"
          className="node-add-btn"
          style={{ borderColor: `${data.accent}55`, color: data.accent, marginTop: 6 }}
          disabled={busy}
          onClick={() => void runFetch()}
        >
          {busy ? 'Fetching…' : 'Fetch prices'}
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
