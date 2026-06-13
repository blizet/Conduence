'use client';

import type { NodeProps } from '@xyflow/react';
import { CatalogToolNode } from '../shared/CatalogToolNode';
import type { WorkflowNode } from '../types';

const TOOL_ID = 'cryptonews';

function CryptoNewsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 4h12v8H2z" />
      <path d="M5 7h6M5 9h4" />
    </svg>
  );
}

export function CryptoNewsNode(props: NodeProps<WorkflowNode>) {
  return <CatalogToolNode {...props} toolId={TOOL_ID} icon={<CryptoNewsIcon />} />;
}
