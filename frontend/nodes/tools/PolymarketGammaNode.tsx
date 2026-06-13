'use client';

import type { NodeProps } from '@xyflow/react';
import { CatalogToolNode } from '../shared/CatalogToolNode';
import type { WorkflowNode } from '../types';

const TOOL_ID = 'polymarketGamma';

function GammaIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
      <path d="M5 7h4M7 5v4" />
    </svg>
  );
}

export function PolymarketGammaNode(props: NodeProps<WorkflowNode>) {
  return <CatalogToolNode {...props} toolId={TOOL_ID} icon={<GammaIcon />} />;
}
