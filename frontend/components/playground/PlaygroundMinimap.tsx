'use client';

import { MiniMap } from '@xyflow/react';
import type { WorkflowNode } from '@/nodes/types';

export function PlaygroundMinimap() {
  return (
    <MiniMap
      position="bottom-right"
      pannable
      zoomable
      ariaLabel="Workflow canvas minimap"
      className="playground-minimap"
      nodeColor={(node) => {
        const accent = (node.data as WorkflowNode['data'])?.accent;
        return typeof accent === 'string' ? accent : '#5b8def';
      }}
      nodeStrokeColor="transparent"
      nodeStrokeWidth={0}
      nodeBorderRadius={4}
      bgColor="rgba(0, 0, 0, 0.5)"
      maskColor="transparent"
      maskStrokeColor="transparent"
      maskStrokeWidth={0}
      style={{
        width: 300,
        height: 104,
        margin: 0,
      }}
    />
  );
}
