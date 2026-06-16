'use client';

import type { NodeProps } from '@xyflow/react';
import { CatalogToolNode } from '../shared/CatalogToolNode';
import type { WorkflowNode } from '../types';

const TOOL_ID = 'walletMonitor';

function WalletMonitorIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="4.5" width="12" height="8" rx="2" />
      <path d="M10.5 8.5h2" />
      <circle cx="6" cy="8.5" r="1.2" />
      <path d="M2 6.5h12" />
    </svg>
  );
}

export function WalletMonitorNode(props: NodeProps<WorkflowNode>) {
  return <CatalogToolNode {...props} toolId={TOOL_ID} icon={<WalletMonitorIcon />} />;
}
