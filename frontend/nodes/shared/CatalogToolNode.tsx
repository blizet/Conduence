'use client';

import type { ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import { isToolNodeMissingKey } from '@/lib/tool-access';
import { GlassNode } from './GlassNode';
import { ToolApiKeyField } from './ToolApiKeyField';
import { useNodeData } from './useNodeData';
import type { WorkflowNode } from '../types';

type CatalogToolNodeProps = NodeProps<WorkflowNode> & {
  toolId: string;
  icon: ReactNode;
};

export function CatalogToolNode({ id, data, selected, toolId, icon }: CatalogToolNodeProps) {
  const updateData = useNodeData(id);

  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="tool"
      accent={data.accent}
      icon={icon}
      selected={selected}
      invalid={isToolNodeMissingKey(toolId, data)}
      handles={[
        { type: 'target', position: 'left' },
        { type: 'source', position: 'right' },
      ]}
    >
      <ToolApiKeyField
        toolId={toolId}
        apiKey={data.apiKey ?? ''}
        onApiKeyChange={(apiKey) => updateData({ apiKey })}
      />
    </GlassNode>
  );
}
