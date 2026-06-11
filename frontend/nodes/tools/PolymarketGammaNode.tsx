'use client';

import { useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { executeToolNode } from '@/lib/workflow-tools';
import { GlassNode } from '../shared/GlassNode';
import { LabeledInput, LabeledInputRow } from '../shared/LabeledField';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode } from '../types';

function GammaIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
      <path d="M5 7h4M7 5v4" />
    </svg>
  );
}

export function PolymarketGammaNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const updateData = useNodeData(id);
  const [busy, setBusy] = useState(false);

  const runFetch = async () => {
    setBusy(true);
    updateData({ workflowStatus: 'running', workflowError: '', workflowResult: '' });
    try {
      const result = await executeToolNode('polymarketGamma', data);
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
      icon={<GammaIcon />}
      selected={selected}
      wide
      handles={[
        { type: 'target', position: 'left' },
        { type: 'source', position: 'right' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <LabeledInput
          label="Keywords (comma-separated)"
          placeholder="bitcoin, fed, trump"
          value={data.gammaKeywords ?? ''}
          onChange={(v) => updateData({ gammaKeywords: v })}
        />
        <LabeledInputRow>
          <LabeledInput
            label="Limit"
            inline
            placeholder="8"
            value={data.gammaLimit ?? ''}
            onChange={(v) => updateData({ gammaLimit: v })}
          />
          <LabeledInput
            label="Max spread"
            inline
            placeholder="0.05"
            value={data.gammaMaxSpread ?? ''}
            onChange={(v) => updateData({ gammaMaxSpread: v })}
          />
        </LabeledInputRow>
        <LabeledInputRow>
          <LabeledInput
            label="Min 24h volume $"
            inline
            placeholder="10000"
            value={data.gammaMinVolume ?? ''}
            onChange={(v) => updateData({ gammaMinVolume: v })}
          />
          <LabeledInput
            label="Min liquidity $"
            inline
            placeholder="10000"
            value={data.gammaMinLiquidity ?? ''}
            onChange={(v) => updateData({ gammaMinLiquidity: v })}
          />
        </LabeledInputRow>
        <div className="node-field__hint" style={{ marginTop: 4 }}>
          Open markets only · ranked by quality score (volume + spread + liquidity), not raw volume
        </div>
        <button
          type="button"
          className="node-add-btn"
          style={{ borderColor: `${data.accent}55`, color: data.accent, marginTop: 6 }}
          disabled={busy}
          onClick={() => void runFetch()}
        >
          {busy ? 'Searching…' : 'Search markets'}
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
