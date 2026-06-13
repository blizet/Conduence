'use client';

import type { NodeProps } from '@xyflow/react';
import { CatalogToolNode } from '../shared/CatalogToolNode';
import type { WorkflowNode } from '../types';

const TOOL_ID = 'coinmarketcap';

function CoinMarketCapIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2.5 8a5.5 5.5 0 1 1 11 0" />
      <path d="M8 5v4m0 0l2-2m-2 2L6 7" />
    </svg>
  );
}

export function CoinMarketCapNode(props: NodeProps<WorkflowNode>) {
  return <CatalogToolNode {...props} toolId={TOOL_ID} icon={<CoinMarketCapIcon />} />;
}
