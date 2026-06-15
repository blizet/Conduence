'use client';

import type { ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import { isToolNodeMissingKey } from '@/lib/tool-access';
import { GlassNode } from './GlassNode';
import { standardToolHandles } from './toolHandles';
import type { WorkflowNode } from '../types';

type CatalogToolNodeProps = NodeProps<WorkflowNode> & {
  toolId: string;
  icon: ReactNode;
};

export function CatalogToolNode({ data, selected, toolId, icon }: CatalogToolNodeProps) {
  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="tool"
      accent={data.accent}
      icon={icon}
      selected={selected}
      invalid={isToolNodeMissingKey(toolId, data)}
      shape="triangle-up"
      handles={standardToolHandles()}
    />
  );
}
