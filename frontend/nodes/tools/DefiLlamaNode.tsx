'use client';

import { useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { executeToolNode } from '@/lib/workflow-tools';
import { ApiKeyField } from '../shared/ApiKeyField';
import { GlassNode } from '../shared/GlassNode';
import { LabeledInput, LabeledSelect } from '../shared/LabeledField';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode, WorkflowNodeData } from '../types';

const DEFILLAMA_MODES: {
  value: NonNullable<WorkflowNodeData['defillamaMode']>;
  label: string;
  tier: 'free' | 'pro';
}[] = [
  { value: 'protocols', label: 'List protocols', tier: 'free' },
  { value: 'protocol', label: 'Protocol detail', tier: 'free' },
  { value: 'tvl', label: 'Protocol current TVL', tier: 'free' },
  { value: 'chains', label: 'All chains TVL', tier: 'free' },
  { value: 'historicalChainTvl', label: 'All chains historical TVL', tier: 'free' },
  { value: 'chain', label: 'Chain historical TVL', tier: 'free' },
  { value: 'tokenProtocols', label: 'Token in protocols (Pro)', tier: 'pro' },
];

const PROTOCOL_MODES = new Set(['protocol', 'tvl']);
const PRO_MODES = new Set(['tokenProtocols']);

function DefiLlamaIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 11h12M4 11V6m4 5V4m4 7V8" />
    </svg>
  );
}

export function DefiLlamaNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const updateData = useNodeData(id);
  const [busy, setBusy] = useState(false);
  const mode = data.defillamaMode ?? 'protocols';
  const isProMode = PRO_MODES.has(mode);

  const runFetch = async () => {
    setBusy(true);
    updateData({ workflowStatus: 'running', workflowError: '', workflowResult: '' });
    try {
      const result = await executeToolNode('defillama', data);
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
      icon={<DefiLlamaIcon />}
      selected={selected}
      wide
      handles={[
        { type: 'target', position: 'left' },
        { type: 'source', position: 'right' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <LabeledSelect
          label="Endpoint"
          value={mode}
          options={DEFILLAMA_MODES.map((item) => ({
            value: item.value,
            label: item.label,
          }))}
          onChange={(v) => updateData({ defillamaMode: v as WorkflowNodeData['defillamaMode'] })}
        />
        <div className="node-field__hint" style={{ marginBottom: 4 }}>
          {isProMode
            ? 'Pro endpoint — API key required'
            : 'Free endpoint — no API key needed'}
        </div>
        {PROTOCOL_MODES.has(mode) && (
          <LabeledInput
            label="Protocol slug"
            placeholder="lido"
            value={data.defillamaProtocol ?? ''}
            onChange={(v) => updateData({ defillamaProtocol: v })}
          />
        )}
        {mode === 'chain' && (
          <LabeledInput
            label="Chain"
            placeholder="Ethereum"
            value={data.defillamaChain ?? ''}
            onChange={(v) => updateData({ defillamaChain: v })}
          />
        )}
        {mode === 'tokenProtocols' && (
          <LabeledInput
            label="Token symbol"
            placeholder="usdt"
            value={data.defillamaSymbol ?? ''}
            onChange={(v) => updateData({ defillamaSymbol: v })}
          />
        )}
        {isProMode && (
          <ApiKeyField
            label="DefiLlama Pro API key"
            value={data.apiKey ?? ''}
            onChange={(v) => updateData({ apiKey: v })}
          />
        )}
        <button
          type="button"
          className="node-add-btn"
          style={{ borderColor: `${data.accent}55`, color: data.accent, marginTop: 6 }}
          disabled={busy}
          onClick={() => void runFetch()}
        >
          {busy ? 'Fetching…' : 'Fetch DefiLlama'}
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
