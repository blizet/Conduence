'use client';

import type { NodeProps } from '@xyflow/react';
import { CatalogToolNode } from '../shared/CatalogToolNode';
import type { WorkflowNode } from '../types';

const TOOL_ID = 'divergence';

function DivergenceIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 8c2 0 3-3 5-3M2 8c2 0 3 3 5 3" />
      <path d="M9 5l5-2.5M9 11l5 2.5" />
      <path d="M12 1.5l2 1-1 2M12 14.5l2-1-1-2" />
    </svg>
  );
}

export function DivergenceNode(props: NodeProps<WorkflowNode>) {
  return <CatalogToolNode {...props} toolId={TOOL_ID} icon={<DivergenceIcon />} />;
}
