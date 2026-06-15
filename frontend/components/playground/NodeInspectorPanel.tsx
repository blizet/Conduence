'use client';

import type { Edge } from '@xyflow/react';
import { getNodeCatalog } from '@/lib/node-catalog';
import { getPaletteItem } from '@/nodes';
import type { WorkflowNode } from '@/nodes/types';
import { NodeInspectorFields } from '@/nodes/shared/inspector/NodeInspectorFields';
import { FieldGuideSection } from '@/nodes/shared/inspector/FieldGuideSection';
import { InspectorSetupSection } from '@/nodes/shared/inspector/InspectorSetupSection';
import { InspectorFieldGuideProvider } from '@/nodes/shared/inspector/InspectorFieldGuideContext';
import { getPaletteIcon } from './paletteIcons';

type NodeInspectorPanelProps = {
  node: WorkflowNode | null;
  nodes: WorkflowNode[];
  edges: Edge[];
  feedSignals?: Record<string, { latest?: unknown }>;
};

const CATEGORY_LABEL: Record<string, string> = {
  tool: 'Tool',
  subagent: 'Sub-agent',
  orchestrator: 'Orchestrator',
  mindagent: 'Mind agent',
};

export function NodeInspectorPanel({ node, nodes, edges, feedSignals }: NodeInspectorPanelProps) {
  if (!node?.type) {
    return (
      <aside className="inspector-panel inspector-panel--empty">
        <div className="inspector-panel__empty">
          <p className="inspector-panel__empty-title">Node inspector</p>
          <p className="inspector-panel__empty-text">
            Select a tool or sub-agent on the canvas to view its summary and configure parameters.
          </p>
        </div>
      </aside>
    );
  }

  const catalog = getNodeCatalog(node.type);
  const paletteItem = getPaletteItem(node.type);
  const category = node.data.category ?? paletteItem?.category ?? 'tool';
  const accent = node.data.accent ?? paletteItem?.accent ?? '#5b8def';
  const toolGroup = node.data.toolGroup ?? paletteItem?.toolGroup;
  const isExecutionTool = toolGroup === 'execution' || toolGroup === 'socials';
  const iconClass = isExecutionTool
    ? 'inspector-panel__icon--execution'
    : `inspector-panel__icon--${category}`;
  const badgeLabel = isExecutionTool ? 'Execution' : CATEGORY_LABEL[category] ?? category;
  const badgeClass = isExecutionTool
    ? 'inspector-panel__badge--execution'
    : `inspector-panel__badge--${category}`;

  return (
    <aside className="inspector-panel dark-scroll">
      <header className="inspector-panel__header">
        <div
          className={`inspector-panel__icon ${iconClass}`}
          style={{ '--chip-accent': accent } as React.CSSProperties}
        >
          {getPaletteIcon(node.type, 16)}
        </div>
        <div className="inspector-panel__title-block">
          <div className="inspector-panel__title-row">
            <h2 className="inspector-panel__title">{node.data.label ?? paletteItem?.label ?? node.type}</h2>
            <span className={`inspector-panel__badge ${badgeClass}`}>{badgeLabel}</span>
          </div>
          {paletteItem?.description ? (
            <p className="inspector-panel__subtitle">{paletteItem.description}</p>
          ) : null}
        </div>
      </header>

      <section className="inspector-panel__section">
        <h3 className="inspector-panel__section-title">About</h3>
        <p className="inspector-panel__summary">{catalog.summary}</p>
        {catalog.helpsWith.length > 0 ? (
          <ul className="inspector-panel__helps">
            {catalog.helpsWith.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <InspectorSetupSection nodeType={node.type} />

      <InspectorFieldGuideProvider nodeId={node.id}>
        <section className="inspector-panel__section inspector-panel__section--fields">
          <h3 className="inspector-panel__section-title">Parameters</h3>
          <NodeInspectorFields key={node.id} node={node} nodes={nodes} edges={edges} feedSignals={feedSignals} />
        </section>

        <FieldGuideSection nodeType={node.type} />
      </InspectorFieldGuideProvider>
    </aside>
  );
}
