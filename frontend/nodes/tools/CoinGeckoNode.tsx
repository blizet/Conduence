'use client';

import type { NodeProps } from '@xyflow/react';
import { CatalogToolNode } from '../shared/CatalogToolNode';
import type { WorkflowNode } from '../types';

const TOOL_ID = 'coingecko';

function CoinGeckoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="6" cy="6.5" r="1.4" fill="currentColor" stroke="none" />
      <path d="M8 11c1.5 0 3-.6 4-1.8" />
    </svg>
  );
}

export function CoinGeckoNode(props: NodeProps<WorkflowNode>) {
  return <CatalogToolNode {...props} toolId={TOOL_ID} icon={<CoinGeckoIcon />} />;
}
