'use client';

import { useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { executeToolNode } from '@/lib/workflow-tools';
import { GlassNode } from '../shared/GlassNode';
import { LabeledInput, LabeledInputRow, LabeledSelect } from '../shared/LabeledField';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode, WorkflowNodeData } from '../types';

function WalletIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="4.5" width="12" height="8" rx="2" />
      <path d="M10.5 8.5h2" />
      <path d="M2 6.5h12" />
    </svg>
  );
}

export function PolymarketWalletNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const updateData = useNodeData(id);
  const [busy, setBusy] = useState(false);

  const runFetch = async () => {
    setBusy(true);
    updateData({ workflowStatus: 'running', workflowError: '', workflowResult: '' });
    try {
      const result = await executeToolNode('polymarketWallet', data);
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
      icon={<WalletIcon />}
      selected={selected}
      wide
      handles={[
        { type: 'target', position: 'left' },
        { type: 'source', position: 'right' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <LabeledInput
          label="Wallet address"
          placeholder="0x…"
          value={data.pmWallet ?? ''}
          onChange={(v) => updateData({ pmWallet: v })}
        />
        <LabeledInputRow>
          <LabeledSelect
            label="Action"
            inline
            value={data.pmWalletAction ?? 'trades'}
            options={[
              { value: 'trades', label: 'Recent trades' },
              { value: 'positions', label: 'Open positions' },
            ]}
            onChange={(v) =>
              updateData({ pmWalletAction: v as WorkflowNodeData['pmWalletAction'] })
            }
          />
          <LabeledInput
            label="Limit"
            inline
            placeholder="20"
            value={data.pmWalletLimit ?? ''}
            onChange={(v) => updateData({ pmWalletLimit: v })}
          />
        </LabeledInputRow>
        <div className="node-field__hint" style={{ marginTop: 4 }}>
          Polymarket Data API — public, no key needed
        </div>
        <button
          type="button"
          className="node-add-btn"
          style={{ borderColor: `${data.accent}55`, color: data.accent, marginTop: 6 }}
          disabled={busy}
          onClick={() => void runFetch()}
        >
          {busy ? 'Fetching…' : 'Fetch wallet activity'}
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
