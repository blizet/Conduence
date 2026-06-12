'use client';



import type { NodeProps } from '@xyflow/react';
import { GlassNode } from '../shared/GlassNode';

import { FetchResultPanel } from '../shared/FetchResultPanel';

import { LabeledInput } from '../shared/LabeledField';

import { ToolAccessFields } from '../shared/ToolAccessFields';

import { useToolFetch } from '../shared/useToolFetch';

import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';

import type { WorkflowNode } from '../types';



function CoinGeckoIcon() {

  return (

    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">

      <circle cx="8" cy="8" r="5.5" />

      <circle cx="6" cy="6.5" r="1.4" fill="currentColor" stroke="none" />

      <path d="M8 11c1.5 0 3-.6 4-1.8" />

    </svg>

  );

}



export function CoinGeckoNode({ id, data, selected }: NodeProps<WorkflowNode>) {

  const updateData = useNodeData(id);

  const { busy, runFetch } = useToolFetch('coingecko', data, updateData);

  const endpoint = data.toolEndpoint ?? 'simple_price';



  return (

    <GlassNode

      label={data.label}

      description={data.description}

      category="tool"

      accent={data.accent}

      icon={<CoinGeckoIcon />}

      selected={selected}

      wide

      handles={[

        { type: 'target', position: 'left' },

        { type: 'source', position: 'right' },

      ]}

    >

      <div onKeyDown={stopNodeKeyPropagation}>

        <ToolAccessFields

          toolId="coingecko"

          accessMode={data.toolAccessMode ?? 'public'}

          endpoint={endpoint}

          apiKey={data.apiKey ?? ''}

          onAccessModeChange={(toolAccessMode) => updateData({ toolAccessMode })}

          onEndpointChange={(toolEndpoint) => updateData({ toolEndpoint })}

          onApiKeyChange={(apiKey) => updateData({ apiKey })}

        />

        {endpoint === 'search' ? (

          <LabeledInput

            label="Search query"

            placeholder="bitcoin"

            value={data.coingeckoQuery ?? ''}

            onChange={(v) => updateData({ coingeckoQuery: v })}

          />

        ) : (

          <LabeledInput

            label="CoinGecko IDs (comma-separated)"

            placeholder="bitcoin, ethereum, zcash"

            value={data.coingeckoIds ?? ''}

            onChange={(v) => updateData({ coingeckoIds: v })}

          />

        )}

        {(endpoint === 'coin_detail' ||

          endpoint === 'coin_market_chart' ||

          endpoint === 'coin_tickers') && (

          <LabeledInput

            label="Coin ID (optional override)"

            placeholder="bitcoin"

            value={data.coingeckoCoinId ?? ''}

            onChange={(v) => updateData({ coingeckoCoinId: v })}

          />

        )}

        {endpoint === 'coin_market_chart' && (

          <LabeledInput

            label="Chart days"

            placeholder="30"

            value={data.coingeckoDays ?? '30'}

            onChange={(v) => updateData({ coingeckoDays: v })}

          />

        )}

        {endpoint === 'onchain_pool_ohlcv' && (

          <>

            <LabeledInput

              label="Network"

              placeholder="eth"

              value={data.coingeckoNetwork ?? ''}

              onChange={(v) => updateData({ coingeckoNetwork: v })}

            />

            <LabeledInput

              label="Pool address"

              placeholder="0x…"

              value={data.coingeckoPoolAddress ?? ''}

              onChange={(v) => updateData({ coingeckoPoolAddress: v })}

            />

          </>

        )}

        <button

          type="button"

          className="node-add-btn"

          style={{ borderColor: `${data.accent}55`, color: data.accent, marginTop: 6 }}

          disabled={busy}

          onClick={() => void runFetch()}

        >

          {busy ? 'Fetching…' : 'Fetch CoinGecko'}

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


