'use client';

import { useMemo, useState } from 'react';
import { DND_TYPE } from '@/lib/dnd';
import {
  EXECUTION_TOOL_GROUPS,
  getExecutionGroupItems,
  getToolGroupItems,
  getUngroupedToolItems,
  PALETTE_ITEMS,
  PALETTE_TOOL_GROUPS,
} from '@/nodes';
import type { PaletteItem, PaletteToolGroup } from '@/nodes/types';
import { GlassPanel } from './GlassPanel';

function onDragStart(event: React.DragEvent, item: PaletteItem) {
  event.dataTransfer.setData(DND_TYPE, item.type);
  event.dataTransfer.effectAllowed = 'move';
}

function PaletteEntry({ item }: { item: PaletteItem }) {
  return (
    <div
      className="palette-item"
      draggable
      onDragStart={(e) => onDragStart(e, item)}
    >
      <div className="palette-item__text">
        <div className="palette-item__label">{item.label}</div>
        <div className="palette-item__desc">{item.description}</div>
      </div>
      <span className="palette-item__grip" aria-hidden>
        <svg width="6" height="10" viewBox="0 0 6 10" fill="currentColor">
          <circle cx="1.5" cy="1.5" r="1.2" />
          <circle cx="4.5" cy="1.5" r="1.2" />
          <circle cx="1.5" cy="5" r="1.2" />
          <circle cx="4.5" cy="5" r="1.2" />
          <circle cx="1.5" cy="8.5" r="1.2" />
          <circle cx="4.5" cy="8.5" r="1.2" />
        </svg>
      </span>
    </div>
  );
}

function RailEntry({ item }: { item: PaletteItem }) {
  const abbr = item.label.slice(0, 2).toUpperCase();
  return (
    <div
      className="palette-rail-item"
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      title={`${item.label} — drag to canvas`}
    >
      <span className="palette-rail-item__abbr">{abbr}</span>
    </div>
  );
}

function PaletteToolGroup({
  title,
  items,
  collapsed,
  onToggle,
  headerVariant,
}: {
  title: string;
  items: PaletteItem[];
  collapsed: boolean;
  onToggle: () => void;
  headerVariant?: string;
}) {
  if (items.length === 0) return null;
  const headerClass = headerVariant
    ? `palette-tool-group__header palette-tool-group__header--${headerVariant}`
    : 'palette-tool-group__header';
  return (
    <div className={`palette-tool-group${collapsed ? ' palette-tool-group--collapsed' : ''}`}>
      <button
        type="button"
        className={headerClass}
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="palette-tool-group__chevron"
          aria-hidden
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        <span className="palette-tool-group__title">{title}</span>
        <span className="palette-tool-group__count">{items.length}</span>
      </button>
      {!collapsed &&
        items.map((item) => (
          <PaletteEntry key={item.type} item={item} />
        ))}
    </div>
  );
}

function isSubagentVisible(item: PaletteItem) {
  return item.category === 'subagent';
}

export function NodePalette() {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? PALETTE_ITEMS.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            item.category.includes(q) ||
            (item.toolGroup?.includes(q) ?? false),
        )
      : PALETTE_ITEMS;
    return base.filter((item) => {
      if (item.category === 'subagent') return isSubagentVisible(item);
      return true;
    });
  }, [query]);

  const mainAgentItems = useMemo(
    () => filtered.filter((item) => item.category === 'orchestrator'),
    [filtered],
  );
  const subagentItems = useMemo(
    () => filtered.filter((item) => item.category === 'subagent'),
    [filtered],
  );
  const executionToolItems = useMemo(
    () =>
      filtered.filter(
        (item) =>
          item.category === 'tool' &&
          (item.toolGroup === 'execution' || item.toolGroup === 'socials'),
      ),
    [filtered],
  );
  const toolItems = useMemo(
    () =>
      filtered.filter(
        (item) =>
          item.category === 'tool' &&
          item.toolGroup !== 'execution' &&
          item.toolGroup !== 'socials',
      ),
    [filtered],
  );
  const ungroupedToolItems = useMemo(() => getUngroupedToolItems(toolItems), [toolItems]);

  const toggleGroup = (groupId: PaletteToolGroup) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const isSearching = query.trim().length > 0;

  return (
    <GlassPanel
      className={`palette-panel palette-panel--sharp${collapsed ? ' palette-panel--collapsed' : ''}`}
    >
      <div className="palette-accent-bar" aria-hidden />
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
            <div className="palette-header__row">
              <div className="palette-header__title">Nodes</div>
              <span className="palette-header__count">{filtered.length}</span>
            </div>
            <input
              className="palette-search"
              type="search"
              placeholder="Search nodes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="palette-scroll dark-scroll">
            {mainAgentItems.length > 0 && (
              <div className="palette-section">
                <div className="palette-section-title palette-section-title--main">
                  <span className="palette-section-title__text">Main Agent</span>
                  <span className="palette-section-title__rule" aria-hidden />
                </div>
                {mainAgentItems.map((item) => (
                  <PaletteEntry key={item.type} item={item} />
                ))}
              </div>
            )}

            {subagentItems.length > 0 && (
              <div className="palette-section">
                <div className="palette-section-title palette-section-title--subagents">
                  <span className="palette-section-title__text">Subagents</span>
                  <span className="palette-section-title__rule" aria-hidden />
                </div>
                {subagentItems.map((item) => (
                  <PaletteEntry key={item.type} item={item} />
                ))}
              </div>
            )}

            {executionToolItems.length > 0 && (
              <div className="palette-section palette-section--execution">
                <div className="palette-section-title palette-section-title--execution">
                  <span className="palette-section-title__text">Execution Tools</span>
                  <span className="palette-section-title__rule" aria-hidden />
                </div>
                {EXECUTION_TOOL_GROUPS.map(({ id, title, headerVariant }) => (
                  <PaletteToolGroup
                    key={id}
                    title={title}
                    items={getExecutionGroupItems(executionToolItems, id)}
                    collapsed={!isSearching && Boolean(collapsedGroups[id])}
                    onToggle={() => toggleGroup(id)}
                    headerVariant={headerVariant}
                  />
                ))}
              </div>
            )}

            {toolItems.length > 0 && (
              <div className="palette-section">
                <div className="palette-section-title palette-section-title--tools">
                  <span className="palette-section-title__text">Tools</span>
                  <span className="palette-section-title__rule" aria-hidden />
                </div>
                {ungroupedToolItems.map((item) => (
                  <PaletteEntry key={item.type} item={item} />
                ))}
                {PALETTE_TOOL_GROUPS.map(({ id, title, headerVariant }) => (
                  <PaletteToolGroup
                    key={id}
                    title={title}
                    items={getToolGroupItems(toolItems, id)}
                    collapsed={!isSearching && Boolean(collapsedGroups[id])}
                    onToggle={() => toggleGroup(id)}
                    headerVariant={headerVariant}
                  />
                ))}
              </div>
            )}

            {filtered.length === 0 && (
              <div className="palette-empty">No nodes match your search</div>
            )}
          </div>

          <div className="palette-footer">Drag nodes onto the canvas · Delete to remove</div>
        </>
      )}

      {collapsed && (
        <div className="palette-rail dark-scroll">
          {mainAgentItems.length > 0 && (
            <div className="palette-rail-group">
              {mainAgentItems.map((item) => (
                <RailEntry key={item.type} item={item} />
              ))}
            </div>
          )}
          {subagentItems.length > 0 && (
            <div className="palette-rail-group">
              {subagentItems.map((item) => (
                <RailEntry key={item.type} item={item} />
              ))}
            </div>
          )}
          {executionToolItems.length > 0 && (
            <div className="palette-rail-group">
              {executionToolItems.map((item) => (
                <RailEntry key={item.type} item={item} />
              ))}
            </div>
          )}
          {toolItems.length > 0 && (
            <div className="palette-rail-group">
              {toolItems.map((item) => (
                <RailEntry key={item.type} item={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </GlassPanel>
  );
}
