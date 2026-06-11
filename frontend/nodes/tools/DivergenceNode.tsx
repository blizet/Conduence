'use client';

import { useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { executeToolNode } from '@/lib/workflow-tools';
import { GlassNode } from '../shared/GlassNode';
import { LabeledInput, LabeledInputRow } from '../shared/LabeledField';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode } from '../types';

function DivergenceIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 8c2 0 3-3 5-3M2 8c2 0 3 3 5 3" />
      <path d="M9 5l5-2.5M9 11l5 2.5" />
      <path d="M12 1.5l2 1-1 2M12 14.5l2-1-1-2" />
    </svg>
  );
}

export function DivergenceNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const updateData = useNodeData(id);
  const [busy, setBusy] = useState(false);

  const runCompute = async () => {
    setBusy(true);
    updateData({ workflowStatus: 'running', workflowError: '', workflowResult: '' });
    try {
      const result = await executeToolNode('divergence', data);
      updateData({
        workflowStatus: result.ok ? 'success' : 'error',
        workflowError: result.error ?? '',
        workflowResult: JSON.stringify(result, null, 2),
      });
    } catch (err) {
      updateData({
        workflowStatus: 'error',
        workflowError: err instanceof Error ? err.message : 'Computation failed',
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
      icon={<DivergenceIcon />}
      selected={selected}
      wide
      handles={[
        { type: 'target', position: 'left' },
        { type: 'source', position: 'right' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <LabeledInputRow>
          <LabeledInput
            label="Base asset"
            inline
            placeholder="bitcoin"
            value={data.divBaseId ?? ''}
            onChange={(v) => updateData({ divBaseId: v })}
          />
          <LabeledInput
            label="Other asset"
            inline
            placeholder="zcash"
            value={data.divOtherId ?? ''}
            onChange={(v) => updateData({ divOtherId: v })}
          />
        </LabeledInputRow>
        <LabeledInputRow>
          <LabeledInput
            label="Base 24h %"
            inline
            placeholder="0.5"
            value={data.divBaseChange ?? ''}
            onChange={(v) => updateData({ divBaseChange: v })}
          />
          <LabeledInput
            label="Other 24h %"
            inline
            placeholder="18.0"
            value={data.divOtherChange ?? ''}
            onChange={(v) => updateData({ divOtherChange: v })}
          />
        </LabeledInputRow>
        <LabeledInput
          label="Expected correlation [-1, 1]"
          placeholder="0.35"
          value={data.divExpectedCorr ?? ''}
          onChange={(v) => updateData({ divExpectedCorr: v })}
        />
        <div className="node-field__hint" style={{ marginTop: 4 }}>
          Local computation — flags assets ≥3pp off their graph-expected co-movement
        </div>
        <button
          type="button"
          className="node-add-btn"
          style={{ borderColor: `${data.accent}55`, color: data.accent, marginTop: 6 }}
          disabled={busy}
          onClick={() => void runCompute()}
        >
          {busy ? 'Computing…' : 'Check divergence'}
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
