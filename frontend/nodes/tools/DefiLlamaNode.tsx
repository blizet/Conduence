'use client';

import type { NodeProps } from '@xyflow/react';
import { GlassNode } from '../shared/GlassNode';
import { ApiKeyField } from '../shared/ApiKeyField';
import { LabeledInput, LabeledSelect } from '../shared/LabeledField';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode } from '../types';

function DefiLlamaIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 11h12M4 11V6m4 5V4m4 7V8" />
    </svg>
  );
}

const MODE_OPTIONS = [
  { value: 'protocols', label: 'All protocols' },
  { value: 'protocol', label: 'Protocol detail' },
  { value: 'tvl', label: 'Protocol TVL' },
  { value: 'chains', label: 'All chains' },
  { value: 'historicalChainTvl', label: 'Historical DeFi TVL' },
  { value: 'chain', label: 'Chain TVL history' },
  { value: 'tokenProtocols', label: 'Token in protocols (Pro)' },
] as const;

const PROTOCOL_MODES = new Set(['protocol', 'tvl']);
const CHAIN_MODES = new Set(['chain']);
const TOKEN_MODES = new Set(['tokenProtocols']);
const PRO_MODES = new Set(['tokenProtocols']);

export function DefiLlamaNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const updateData = useNodeData(id);
  const mode = data.toolEndpoint ?? data.defillamaMode ?? 'protocols';

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
          label="Mode"
          value={mode}
          options={[...MODE_OPTIONS]}
          onChange={(toolEndpoint) =>
            updateData({
              toolEndpoint,
              defillamaMode: toolEndpoint as WorkflowNode['data']['defillamaMode'],
              toolAccessMode: PRO_MODES.has(toolEndpoint) ? 'private' : 'public',
            })
          }
        />
        {PROTOCOL_MODES.has(mode) && (
          <LabeledInput
            label="Protocol slug"
            placeholder="aave"
            value={data.defillamaProtocol ?? ''}
            onChange={(v) => updateData({ defillamaProtocol: v })}
          />
        )}
        {CHAIN_MODES.has(mode) && (
          <LabeledInput
            label="Chain"
            placeholder="Ethereum"
            value={data.defillamaChain ?? ''}
            onChange={(v) => updateData({ defillamaChain: v })}
          />
        )}
        {TOKEN_MODES.has(mode) && (
          <LabeledInput
            label="Token symbol"
            placeholder="usdt"
            value={data.defillamaSymbol ?? ''}
            onChange={(v) => updateData({ defillamaSymbol: v })}
          />
        )}
        {PRO_MODES.has(mode) && (
          <ApiKeyField
            label="DefiLlama Pro API key"
            value={data.apiKey ?? ''}
            onChange={(apiKey) => updateData({ apiKey })}
          />
        )}
      </div>
    </GlassNode>
  );
}
