'use client';

import type { NodeProps } from '@xyflow/react';
import { GlassNode } from '../shared/GlassNode';
import { ApiKeyField } from '../shared/ApiKeyField';
import { LabeledInput, LabeledInputRow, LabeledSelect } from '../shared/LabeledField';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode } from '../types';

function CryptoQuantIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 12l3-3 2 2 4-5 3 3" />
    </svg>
  );
}

const METRIC_OPTIONS = [
  { value: 'btc/exchange-flows/netflow', label: 'BTC exchange netflow' },
  { value: 'btc/exchange-flows/inflow', label: 'BTC exchange inflow' },
  { value: 'btc/exchange-flows/outflow', label: 'BTC exchange outflow' },
  { value: 'btc/exchange-flows/reserve', label: 'BTC exchange reserve' },
  { value: 'btc/flow-indicator/exchange-whale-ratio', label: 'BTC whale ratio' },
  { value: 'btc/flow-indicator/mpi', label: 'BTC miner position index' },
  { value: 'btc/miner-flows/netflow', label: 'BTC miner netflow' },
  { value: 'btc/market-data/funding-rates', label: 'BTC funding rates' },
  { value: 'btc/market-data/open-interest', label: 'BTC open interest' },
  { value: 'eth/exchange-flows/netflow', label: 'ETH exchange netflow' },
  { value: 'eth/exchange-flows/reserve', label: 'ETH exchange reserve' },
  { value: 'eth/market-data/funding-rates', label: 'ETH funding rates' },
];

export function CryptoQuantNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const updateData = useNodeData(id);

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
          onChange={(apiKey) =>
            updateData({ apiKey, toolAccessMode: 'private', toolEndpoint: 'metric' })
          }
        />
        <LabeledSelect
          label="Metric"
          value={data.cryptoquantMetric ?? 'btc/exchange-flows/netflow'}
          options={METRIC_OPTIONS}
          onChange={(v) => updateData({ cryptoquantMetric: v })}
        />
        <LabeledInputRow>
          <LabeledSelect
            label="Window"
            inline
            value={data.cryptoquantWindow ?? 'day'}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'hour', label: 'Hour' },
            ]}
            onChange={(v) => updateData({ cryptoquantWindow: v })}
          />
          <LabeledInput
            label="Exchange"
            inline
            placeholder="binance"
            value={data.cryptoquantExchange ?? ''}
            onChange={(v) => updateData({ cryptoquantExchange: v })}
          />
        </LabeledInputRow>
      </div>
    </GlassNode>
  );
}
