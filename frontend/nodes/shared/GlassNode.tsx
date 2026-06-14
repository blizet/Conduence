'use client';

import { Handle, Position } from '@xyflow/react';
import type { HandleConfig, NodeCategory } from '../types';

const POSITION_MAP: Record<HandleConfig['position'], Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

const CATEGORY_LABEL: Record<NodeCategory, string> = {
  tool: 'tool',
  mindagent: 'mind',
  subagent: 'sub',
  orchestrator: 'main',
};

export type NodeShape = 'card' | 'trigger' | 'terminal' | 'route' | 'agent';

type GlassNodeProps = {
  label: string;
  description?: string;
  category: NodeCategory;
  accent: string;
  icon: React.ReactNode;
  handles: HandleConfig[];
  selected?: boolean;
  wide?: boolean;
  shape?: NodeShape;
  invalid?: boolean;
  children?: React.ReactNode;
};

export function GlassNode({
  label,
  description,
  category,
  accent,
  icon,
  handles,
  selected,
  wide,
  shape,
  invalid,
  children,
}: GlassNodeProps) {
  const resolvedShape: NodeShape =
    shape ?? (category === 'mindagent' || category === 'orchestrator' ? 'agent' : 'card');

  const inputPorts = handles.filter(
    (h) => h.type === 'target' && h.label && h.position === 'left',
  );
  const plainHandles = handles.filter(
    (h) => !(h.type === 'target' && h.label && h.position === 'left'),
  );

  return (
    <div
      className={[
        'glass-node',
        `glass-node--${resolvedShape}`,
        selected ? 'selected' : '',
        invalid ? 'glass-node--missing-key' : '',
        wide ? 'glass-node--wide' : '',
        inputPorts.length > 0 ? 'glass-node--has-outside-ports' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--node-accent': accent } as React.CSSProperties}
    >
      <div className="glass-node__accent" />

      {inputPorts.map((h) => (
        <Handle
          key={h.id}
          type="target"
          position={Position.Left}
          id={h.id}
          className="glass-node__port-handle glass-node__port-handle--diamond"
          style={{
            background: accent,
            borderColor: 'rgba(255,255,255,0.45)',
            top: h.style?.top ?? '50%',
            left: 0,
            transform: 'translate(-50%, -50%) rotate(45deg)',
          }}
        />
      ))}

      {inputPorts.map((h) => (
        <div
          key={`outside-${h.id}`}
          className="glass-node__port-outside nodrag nopan"
          style={{ top: h.style?.top ?? '50%' }}
        >
          <span className="glass-node__port-label" style={{ color: accent }}>
            {h.label}
          </span>
        </div>
      ))}

      {plainHandles.map((h) => (
        <Handle
          key={h.id ?? `${h.type}-${h.position}`}
          type={h.type}
          position={POSITION_MAP[h.position]}
          id={h.id}
          style={{
            background: accent,
            borderColor: 'rgba(255,255,255,0.4)',
            width: 7,
            height: 7,
            ...h.style,
          }}
        />
      ))}

      <div className="glass-node__header">
        <div className="glass-node__icon">
          <span className="glass-node__icon-inner">{icon}</span>
        </div>
        <div className="glass-node__meta">
          <div className="glass-node__title-row">
            <span className="glass-node__label">{label}</span>
            <span className={`glass-node__badge glass-node__badge--${category}`}>
              {CATEGORY_LABEL[category]}
            </span>
          </div>
          {description && !children && <div className="glass-node__desc">{description}</div>}
        </div>
      </div>

      {children}

      {handles.some((h) => h.type === 'source' && h.label) && (
        <div className="glass-node__handle-labels">
          {handles
            .filter((h) => h.type === 'source' && h.label)
            .map((h) => (
              <span key={h.id} style={{ color: accent }}>
                {h.label}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
