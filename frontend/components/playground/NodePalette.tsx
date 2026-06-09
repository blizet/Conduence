'use client';

import { useMemo, useState } from 'react';
import { DND_TYPE } from '@/lib/dnd';
import { useInstalledNodeTypes } from '@/lib/marketplace';
import { PALETTE_ITEMS } from '@/nodes';
import type { NodeCategory, PaletteItem } from '@/nodes/types';
import { GlassPanel } from './GlassPanel';

function onDragStart(event: React.DragEvent, item: PaletteItem) {
  event.dataTransfer.setData(DND_TYPE, item.type);
  event.dataTransfer.effectAllowed = 'move';
}

function PaletteEntry({ item }: { item: PaletteItem }) {
  return (
    <div className="palette-item" draggable onDragStart={(e) => onDragStart(e, item)}>
      <div className="palette-item__dot" style={{ color: item.accent, background: item.accent }} />
      <div>
        <div className="palette-item__label">{item.label}</div>
        <div className="palette-item__desc">{item.description}</div>
      </div>
    </div>
  );
}

const SECTIONS: { category: NodeCategory; title: string; className: string }[] = [
  { category: 'tool', title: 'Tools', className: 'palette-section-title--tools' },
  { category: 'subagent', title: 'Subagents', className: 'palette-section-title--subagents' },
  { category: 'mindagent', title: 'Mind Agents', className: 'palette-section-title--mindagents' },
];

export function NodePalette() {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const installedNodeTypes = useInstalledNodeTypes();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PALETTE_ITEMS.filter((item) => {
      if (item.category === 'mindagent' && !installedNodeTypes.has(item.type)) {
        return false;
      }
      if (!q) return true;
      return (
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.includes(q)
      );
    });
  }, [query, installedNodeTypes]);

  return (
    <GlassPanel
      className={`palette-panel${collapsed ? ' palette-panel--collapsed' : ''}`}
      style={{
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        position: 'relative',
      }}
    >
      <button
        type="button"
        className="palette-collapse-btn"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? 'Expand panel' : 'Collapse panel'}
        aria-label={collapsed ? 'Expand node panel' : 'Collapse node panel'}
        aria-expanded={!collapsed}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={collapsed ? 'palette-collapse-btn__icon--collapsed' : undefined}
        >
          <path d="M10 4L6 8l4 4" />
        </svg>
      </button>

      {!collapsed && (
        <>
          <div className="palette-header">
            <div className="palette-header__title">Nodes</div>
            <input
              className="palette-search"
              type="search"
              placeholder="Search nodes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="palette-scroll dark-scroll">
            {SECTIONS.map(({ category, title, className }, sectionIndex) => {
              const items = filtered.filter((item) => item.category === category);
              if (items.length === 0) return null;
              return (
                <div key={category}>
                  <div
                    className={`palette-section-title ${className}`}
                    style={sectionIndex > 0 ? { marginTop: 12 } : undefined}
                  >
                    {title}
                  </div>
                  {items.map((item) => (
                    <PaletteEntry key={item.type} item={item} />
                  ))}
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="palette-empty">No nodes match your search</div>
            )}
          </div>

          <div className="palette-footer">Drag nodes onto the canvas · Delete to remove</div>
        </>
      )}

      {collapsed && (
        <div className="palette-collapsed-label" aria-hidden>
          NODES
        </div>
      )}
    </GlassPanel>
  );
}
