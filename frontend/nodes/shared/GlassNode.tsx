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
};

/**
 * Visual shape language (n8n-inspired, usability-preserving):
 * - trigger:  half-pill, rounded entry edge — workflow entry points
 * - terminal: half-pill mirrored — workflow exits
 * - route:    diamond icon plate — branching / decision nodes
 * - agent:    large gradient-header card — mind agents (the "brains")
 * - card:     standard glass card — tools & everything else
 */
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
  children,
}: GlassNodeProps) {
  const resolvedShape: NodeShape =
    shape ?? (category === 'mindagent' ? 'agent' : 'card');

  return (
    <div
      className={[
        'glass-node',
        `glass-node--${resolvedShape}`,
        selected ? 'selected' : '',
        wide ? 'glass-node--wide' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--node-accent': accent } as React.CSSProperties}
    >
      <div className="glass-node__accent" />

      {handles.map((h) => (
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

      {handles.some((h) => h.label) && (
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
