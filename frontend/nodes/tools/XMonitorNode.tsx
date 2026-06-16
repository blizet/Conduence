'use client';

import type { NodeProps } from '@xyflow/react';
import { CatalogToolNode } from '../shared/CatalogToolNode';
import type { WorkflowNode } from '../types';

const TOOL_ID = 'xMonitor';

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 3l10 10M13 3L3 13" />
    </svg>
  );
}

export function XMonitorNode(props: NodeProps<WorkflowNode>) {
  return <CatalogToolNode {...props} toolId={TOOL_ID} icon={<XIcon />} />;
}
