'use client';



import type { NodeProps } from '@xyflow/react';

import { FetchResultPanel } from '../shared/FetchResultPanel';

import { GlassNode } from '../shared/GlassNode';

import { useToolFetch } from '../shared/useToolFetch';

import { LabeledInput } from '../shared/LabeledField';

import { ToolAccessFields } from '../shared/ToolAccessFields';

import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';

import type { WorkflowNode } from '../types';



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

  const { busy, runFetch } = useToolFetch('polymarketWallet', data, updateData);



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

        <ToolAccessFields

          toolId="polymarketWallet"

          accessMode={data.toolAccessMode ?? 'public'}

          endpoint={data.toolEndpoint ?? 'wallet_trades'}

          apiKey={data.apiKey ?? ''}

          onAccessModeChange={(toolAccessMode) => updateData({ toolAccessMode })}

          onEndpointChange={(toolEndpoint) => updateData({ toolEndpoint })}

          onApiKeyChange={(apiKey) => updateData({ apiKey })}

        />

        <LabeledInput

          label="Wallet address"

          placeholder="0x…"

          value={data.pmWallet ?? ''}

          onChange={(v) => updateData({ pmWallet: v })}

        />

        <LabeledInput

          label="Limit"

          placeholder="20"

          value={data.pmWalletLimit ?? ''}

          onChange={(v) => updateData({ pmWalletLimit: v })}

        />

        <button

          type="button"

          className="node-add-btn"

          style={{ borderColor: `${data.accent}55`, color: data.accent, marginTop: 6 }}

          disabled={busy}

          onClick={() => void runFetch()}

        >

          {busy ? 'Fetching…' : 'Fetch wallet activity'}

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


