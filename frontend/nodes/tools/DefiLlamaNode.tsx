'use client';



import type { NodeProps } from '@xyflow/react';
import { FetchResultPanel } from '../shared/FetchResultPanel';

import { GlassNode } from '../shared/GlassNode';

import { useToolFetch } from '../shared/useToolFetch';

import { LabeledInput } from '../shared/LabeledField';

import { ToolAccessFields } from '../shared/ToolAccessFields';

import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';

import type { WorkflowNode } from '../types';



function DefiLlamaIcon() {

  return (

    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">

      <path d="M2 11h12M4 11V6m4 5V4m4 7V8" />

    </svg>

  );

}



const PROTOCOL_MODES = new Set(['protocol', 'tvl', 'inflows']);

const CHAIN_MODES = new Set(['chain']);

const TOKEN_MODES = new Set(['tokenProtocols']);



export function DefiLlamaNode({ id, data, selected }: NodeProps<WorkflowNode>) {

  const updateData = useNodeData(id);

  const { busy, runFetch } = useToolFetch('defillama', data, updateData);

  const endpoint = data.toolEndpoint ?? data.defillamaMode ?? 'protocols';



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

        <ToolAccessFields

          toolId="defillama"

          accessMode={data.toolAccessMode ?? 'public'}

          endpoint={endpoint}

          apiKey={data.apiKey ?? ''}

          onAccessModeChange={(toolAccessMode) => updateData({ toolAccessMode })}

          onEndpointChange={(toolEndpoint) =>

            updateData({ toolEndpoint, defillamaMode: toolEndpoint as WorkflowNode['data']['defillamaMode'] })

          }

          onApiKeyChange={(apiKey) => updateData({ apiKey })}

        />

        {PROTOCOL_MODES.has(endpoint) && (

          <LabeledInput

            label="Protocol slug"

            placeholder="lido"

            value={data.defillamaProtocol ?? ''}

            onChange={(v) => updateData({ defillamaProtocol: v })}

          />

        )}

        {endpoint === 'inflows' && (

          <LabeledInput

            label="Timestamp (unix)"

            placeholder="1700000000"

            value={data.defillamaTimestamp ?? ''}

            onChange={(v) => updateData({ defillamaTimestamp: v })}

          />

        )}

        {CHAIN_MODES.has(endpoint) && (

          <LabeledInput

            label="Chain"

            placeholder="Ethereum"

            value={data.defillamaChain ?? ''}

            onChange={(v) => updateData({ defillamaChain: v })}

          />

        )}

        {TOKEN_MODES.has(endpoint) && (

          <LabeledInput

            label="Token symbol"

            placeholder="usdt"

            value={data.defillamaSymbol ?? ''}

            onChange={(v) => updateData({ defillamaSymbol: v })}

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


