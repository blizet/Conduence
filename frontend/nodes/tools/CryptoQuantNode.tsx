'use client';

import type { NodeProps } from '@xyflow/react';
import { FetchResultPanel } from '../shared/FetchResultPanel';
import { GlassNode } from '../shared/GlassNode';
import { useToolFetch } from '../shared/useToolFetch';
import { LabeledInput, LabeledInputRow } from '../shared/LabeledField';
import { ToolAccessFields } from '../shared/ToolAccessFields';
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
  const { busy, runFetch } = useToolFetch('cryptoquant', data, updateData);
  const endpoint = data.toolEndpoint ?? 'metric';

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
        <ToolAccessFields
          toolId="cryptoquant"
          accessMode={data.toolAccessMode ?? 'private'}
          endpoint={endpoint}
          apiKey={data.apiKey ?? ''}
          onAccessModeChange={(toolAccessMode) => updateData({ toolAccessMode })}
          onEndpointChange={(toolEndpoint) => updateData({ toolEndpoint })}
          onApiKeyChange={(apiKey) => updateData({ apiKey })}
        />
        {endpoint === 'metric' && (
          <LabeledInput
            label="Metric path"
            placeholder="btc/exchange-flows/inflow"
            value={data.cryptoquantMetric ?? ''}
            onChange={(v) => updateData({ cryptoquantMetric: v })}
          />
        )}
        {endpoint === 'metric' && (
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
        )}
        {endpoint === 'metric' && (
          <LabeledInput
            label="Exchange"
            placeholder="Optional"
            value={data.cryptoquantExchange ?? ''}
            onChange={(v) => updateData({ cryptoquantExchange: v })}
          />
        )}
        <button
          type="button"
          className="node-add-btn"
          style={{ borderColor: `${data.accent}55`, color: data.accent, marginTop: 6 }}
          disabled={busy}
          onClick={() => void runFetch()}
        >
          {busy ? 'Fetching…' : 'Fetch CryptoQuant'}
        </button>
        <FetchResultPanel
          status={data.workflowStatus}
          error={data.workflowError}
          result={data.workflowResult}
          durationMs={data.workflowDurationMs}
        />
      </div>
    </GlassNode>
  );
}
