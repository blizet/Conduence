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

type GlassNodeProps = {
  label: string;
  description?: string;
  category: NodeCategory;
  accent: string;
  icon: React.ReactNode;
  handles: HandleConfig[];
  selected?: boolean;
  wide?: boolean;
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
  children,
}: GlassNodeProps) {
  return (
    <div
      className={`glass-node${selected ? ' selected' : ''}${wide ? ' glass-node--wide' : ''}`}
      style={{
        position: 'relative',
        boxShadow: selected
          ? `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 16px ${accent}40, 0 2px 12px rgba(0,0,0,0.4)`
          : undefined,
      }}
    >
      <div className="glass-node__accent" style={{ background: accent, boxShadow: `0 0 8px ${accent}80` }} />

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
        <div className="glass-node__icon" style={{ color: accent, background: `${accent}18`, borderColor: `${accent}40` }}>
          {icon}
        </div>
        <div className="glass-node__meta">
          <div className="glass-node__title-row">
            <span className="glass-node__label">{label}</span>
            <span className={`glass-node__badge glass-node__badge--${category}`}>{CATEGORY_LABEL[category]}</span>
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
