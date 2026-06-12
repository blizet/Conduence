'use client';



import type { NodeProps } from '@xyflow/react';
import { FetchResultPanel } from '../shared/FetchResultPanel';

import { GlassNode } from '../shared/GlassNode';

import { useToolFetch } from '../shared/useToolFetch';

import { LabeledInput, LabeledInputRow } from '../shared/LabeledField';

import { ToolAccessFields } from '../shared/ToolAccessFields';

import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';

import type { WorkflowNode } from '../types';



function CoinMarketCapIcon() {

  return (

    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">

      <path d="M2.5 8a5.5 5.5 0 1 1 11 0" />

      <path d="M8 5v4m0 0l2-2m-2 2L6 7" />

    </svg>

  );

}



export function CoinMarketCapNode({ id, data, selected }: NodeProps<WorkflowNode>) {

  const updateData = useNodeData(id);

  const { busy, runFetch } = useToolFetch('coinmarketcap', data, updateData);



  return (

    <GlassNode

      label={data.label}

      description={data.description}

      category="tool"

      accent={data.accent}

      icon={<CoinMarketCapIcon />}

      selected={selected}

      wide

      handles={[

        { type: 'target', position: 'left' },

        { type: 'source', position: 'right' },

      ]}

    >

      <div onKeyDown={stopNodeKeyPropagation}>

        <ToolAccessFields

          toolId="coinmarketcap"

          accessMode={data.toolAccessMode ?? 'private'}

          endpoint={data.toolEndpoint ?? 'quotes_latest'}

          apiKey={data.apiKey ?? ''}

          onAccessModeChange={(toolAccessMode) => updateData({ toolAccessMode })}

          onEndpointChange={(toolEndpoint) => updateData({ toolEndpoint })}

          onApiKeyChange={(apiKey) => updateData({ apiKey })}

        />

        <LabeledInputRow>

          <LabeledInput

            label="Symbols"

            inline

            placeholder="BTC,ETH"

            value={data.cmcSymbols ?? ''}

            onChange={(v) => updateData({ cmcSymbols: v })}

          />

          <LabeledInput

            label="Convert to"

            inline

            placeholder="USD"

            value={data.cmcConvert ?? ''}

            onChange={(v) => updateData({ cmcConvert: v })}

          />

        </LabeledInputRow>

        <button

          type="button"

          className="node-add-btn"

          style={{ borderColor: `${data.accent}55`, color: data.accent }}

          disabled={busy}

          onClick={() => void runFetch()}

        >

          {busy ? 'Fetching…' : 'Fetch CoinMarketCap'}

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


