'use client';

import type { NodeProps } from '@xyflow/react';
import { FetchResultPanel } from '../shared/FetchResultPanel';
import { GlassNode } from '../shared/GlassNode';
import { useToolFetch } from '../shared/useToolFetch';
import { LabeledInput, LabeledInputRow } from '../shared/LabeledField';
import { ToolAccessFields } from '../shared/ToolAccessFields';
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
  const { busy, runFetch } = useToolFetch('polymarketGamma', data, updateData);
  const endpoint = data.toolEndpoint ?? 'markets_search';

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
        <ToolAccessFields
          toolId="polymarketGamma"
          accessMode={data.toolAccessMode ?? 'public'}
          endpoint={endpoint}
          apiKey={data.apiKey ?? ''}
          onAccessModeChange={(toolAccessMode) => updateData({ toolAccessMode })}
          onEndpointChange={(toolEndpoint) => updateData({ toolEndpoint })}
          onApiKeyChange={(apiKey) => updateData({ apiKey })}
        />
        {endpoint === 'markets_search' && (
          <LabeledInput
            label="Keywords (comma-separated)"
            placeholder="bitcoin, fed, trump"
            value={data.gammaKeywords ?? ''}
            onChange={(v) => updateData({ gammaKeywords: v })}
          />
        )}
        <LabeledInputRow>
          <LabeledInput
            label="Limit"
            inline
            placeholder="8"
            value={data.gammaLimit ?? ''}
            onChange={(v) => updateData({ gammaLimit: v })}
          />
          {endpoint === 'markets_search' && (
            <LabeledInput
              label="Max spread"
              inline
              placeholder="0.05"
              value={data.gammaMaxSpread ?? ''}
              onChange={(v) => updateData({ gammaMaxSpread: v })}
            />
          )}
        </LabeledInputRow>
        {endpoint === 'markets_search' && (
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
        )}
        <button
          type="button"
          className="node-add-btn"
          style={{ borderColor: `${data.accent}55`, color: data.accent, marginTop: 6 }}
          disabled={busy}
          onClick={() => void runFetch()}
        >
          {busy ? 'Searching…' : 'Fetch Polymarket'}
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
