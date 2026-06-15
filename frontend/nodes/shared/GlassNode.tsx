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

export type NodeShape = 'card' | 'circle' | 'square' | 'execution' | 'trigger' | 'terminal' | 'route' | 'agent';

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

function isLabeledPort(h: HandleConfig, position: HandleConfig['position']) {
  return Boolean(h.label) && h.position === position;
}

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
    shape ??
    (category === 'tool'
      ? 'circle'
      : category === 'subagent'
        ? 'card'
        : category === 'mindagent' || category === 'orchestrator'
          ? 'agent'
          : 'card');

  const isCircle = resolvedShape === 'circle';
  const isExecution = resolvedShape === 'execution';
  const isCompact = isCircle || isExecution;
  const isSubagentCard = category === 'subagent' && resolvedShape === 'card';

  const leftPorts = handles.filter((h) => isLabeledPort(h, 'left'));
  const rightPorts = handles.filter((h) => isLabeledPort(h, 'right'));
  const topPorts = handles.filter((h) => isLabeledPort(h, 'top'));
  const bottomPorts = handles.filter((h) => isLabeledPort(h, 'bottom'));
  const plainHandles = handles.filter(
    (h) =>
      !isLabeledPort(h, 'left') &&
      !isLabeledPort(h, 'right') &&
      !isLabeledPort(h, 'top') &&
      !isLabeledPort(h, 'bottom'),
  );

  const portHandleClass = (diamond: boolean) =>
    [
      'glass-node__port-handle',
      diamond ? 'glass-node__port-handle--diamond' : 'glass-node__port-handle--dot',
    ].join(' ');

  return (
    <div
      className={[
        'glass-node',
        `glass-node--${resolvedShape}`,
        isCompact ? 'glass-node--compact' : '',
        isExecution ? 'glass-node--execution' : '',
        isSubagentCard ? 'glass-node--subagent-card' : '',
        bottomPorts.length > 0 ? 'glass-node--has-bottom-ports' : '',
        topPorts.length > 0 ? 'glass-node--has-top-ports' : '',
        selected ? 'selected' : '',
        invalid ? 'glass-node--missing-key' : '',
        wide && !isCompact ? 'glass-node--wide' : '',
        leftPorts.length > 0 || rightPorts.length > 0 || topPorts.length > 0
          ? 'glass-node--has-outside-ports'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--node-accent': accent } as React.CSSProperties}
    >
      {isExecution ? (
        <div className="glass-node__accent-bottom" aria-hidden />
      ) : !isCircle ? (
        <div className="glass-node__accent" />
      ) : null}

      {leftPorts.map((h) => (
        <Handle
          key={h.id}
          type={h.type}
          position={Position.Left}
          id={h.id}
          className={portHandleClass(!isCompact)}
          style={{
            background: accent,
            borderColor: 'rgba(255,255,255,0.45)',
            top: h.style?.top ?? '50%',
            left: 0,
            ...(isCompact
              ? { transform: 'translate(-50%, -50%)' }
              : { transform: 'translate(-50%, -50%) rotate(45deg)' }),
          }}
        />
      ))}

      {leftPorts.map((h) => (
        <div
          key={`outside-left-${h.id}`}
          className="glass-node__port-outside nodrag nopan"
          style={{ top: h.style?.top ?? '50%' }}
        >
          <span className="glass-node__port-label" style={{ color: accent }}>
            {h.label}
          </span>
        </div>
      ))}

      {rightPorts.map((h) => (
        <Handle
          key={h.id}
          type={h.type}
          position={Position.Right}
          id={h.id}
          className={portHandleClass(!isCompact)}
          style={{
            background: accent,
            borderColor: 'rgba(255,255,255,0.45)',
            top: h.style?.top ?? '50%',
            right: 0,
            ...(isCompact
              ? { transform: 'translate(50%, -50%)' }
              : { transform: 'translate(50%, -50%) rotate(45deg)' }),
          }}
        />
      ))}

      {rightPorts.map((h) => (
        <div
          key={`outside-right-${h.id}`}
          className="glass-node__port-outside-right nodrag nopan"
          style={{ top: h.style?.top ?? '50%' }}
        >
          <span className="glass-node__port-label" style={{ color: accent }}>
            {h.label}
          </span>
        </div>
      ))}

      {topPorts.map((h) => (
        <Handle
          key={h.id}
          type={h.type}
          position={Position.Top}
          id={h.id}
          className={portHandleClass(!isCompact)}
          style={{
            background: accent,
            borderColor: 'rgba(255,255,255,0.45)',
            left: h.style?.left ?? '50%',
            top: 0,
            ...(isCompact
              ? { transform: 'translate(-50%, -50%)' }
              : { transform: 'translate(-50%, -50%) rotate(45deg)' }),
          }}
        />
      ))}

      {topPorts.map((h) => (
        <div
          key={`outside-top-${h.id}`}
          className="glass-node__port-above nodrag nopan"
          style={{ left: h.style?.left ?? '50%' }}
        >
          <span className="glass-node__port-label" style={{ color: accent }}>
            {h.label}
          </span>
        </div>
      ))}

      {bottomPorts.map((h) => (
        <Handle
          key={h.id}
          type="target"
          position={Position.Bottom}
          id={h.id}
          className="glass-node__port-handle glass-node__port-handle--diamond glass-node__port-handle--bottom"
          style={{
            left: h.style?.left ?? '50%',
          }}
        />
      ))}

      {bottomPorts.map((h) => (
        <div
          key={`outside-bottom-${h.id}`}
          className="glass-node__port-below nodrag nopan"
          style={{ left: h.style?.left ?? '50%' }}
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
          className={h.type === 'source' && h.position === 'top' ? 'glass-node__snap-source' : undefined}
          style={{
            background: accent,
            borderColor: 'rgba(255, 255, 255, 0.4)',
            width: h.position === 'top' ? 10 : 7,
            height: h.position === 'top' ? 10 : 7,
            ...h.style,
          }}
        />
      ))}

      {isCompact ? (
        <div className="glass-node__compact" title={label}>
          <div
            className={[
              'glass-node__icon',
              'glass-node__icon--compact',
              isExecution ? 'glass-node__icon--compact-square' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="glass-node__icon-inner">{icon}</span>
          </div>
          <span className="glass-node__compact-label">{label}</span>
        </div>
      ) : (
        <>
          <div
            className={[
              'glass-node__header',
              isSubagentCard ? 'glass-node__header--subagent' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="glass-node__icon">
              <span className="glass-node__icon-inner">{icon}</span>
            </div>
            <div className="glass-node__meta">
              <div className="glass-node__title-row">
                <span className="glass-node__label">{label}</span>
                {!isSubagentCard ? (
                  <span className={`glass-node__badge glass-node__badge--${category}`}>
                    {CATEGORY_LABEL[category]}
                  </span>
                ) : null}
              </div>
              {description ? (
                <div className={isSubagentCard ? 'glass-node__subtitle' : 'glass-node__desc'}>
                  {description}
                </div>
              ) : null}
            </div>
          </div>

          {children}
        </>
      )}

      {handles.some(
        (h) =>
          h.type === 'source' &&
          h.label &&
          !isLabeledPort(h, 'right') &&
          !isLabeledPort(h, 'top'),
      ) && (
        <div className="glass-node__handle-labels">
          {handles
            .filter(
              (h) =>
                h.type === 'source' &&
                h.label &&
                !isLabeledPort(h, 'right') &&
                !isLabeledPort(h, 'top'),
            )
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
