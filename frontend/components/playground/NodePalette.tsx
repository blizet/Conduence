'use client';

import { useEffect, useMemo, useState } from 'react';
import { DND_TYPE } from '@/lib/dnd';
import {
  fetchContextGraphs,
  fetchFalkorGraphIds,
  filterGraphsForUser,
  type ContextGraphSpec,
} from '@/lib/graph-catalog';
import { DEFAULT_COT_USER_NODE_ID } from '@/nodes/constants';
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

function PaletteGraphEntry({
  title,
  subtitle,
  meta,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
}) {
  return (
    <div className="palette-graph-item">
      <div className="palette-graph-item__text">
        <div className="palette-graph-item__label">{title}</div>
        {subtitle && <div className="palette-graph-item__desc">{subtitle}</div>}
      </div>
      {meta && <span className="palette-graph-item__meta">{meta}</span>}
    </div>
  );
}

function PaletteGraphsSection({
  collapsed,
  onToggle,
  contextGraphs,
  userGraphs,
  userSlug,
  loading,
}: {
  collapsed: boolean;
  onToggle: () => void;
  contextGraphs: ContextGraphSpec[];
  userGraphs: string[];
  userSlug: string;
  loading: boolean;
}) {
  const total = contextGraphs.length + userGraphs.length;
  return (
    <div className={`palette-tool-group${collapsed ? ' palette-tool-group--collapsed' : ''}`}>
      <button
        type="button"
        className="palette-tool-group__header palette-tool-group__header--graphs"
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
        <span className="palette-tool-group__title">Graphs</span>
        <span className="palette-tool-group__count">{total}</span>
      </button>
      {!collapsed && (
        <div className="palette-graph-list">
          {loading && <div className="palette-empty">Loading graphs…</div>}
          {!loading && contextGraphs.length > 0 && (
            <>
              <div className="palette-graph-subhead">Context</div>
              {contextGraphs.map((g) => (
                <PaletteGraphEntry
                  key={g.id}
                  title={g.label ?? g.id}
                  subtitle={g.description}
                  meta={`${g.node_count ?? 0}n · ${g.edge_count ?? 0}e`}
                />
              ))}
            </>
          )}
          {!loading && (
            <>
              <div className="palette-graph-subhead">User · {userSlug}</div>
              {userGraphs.length === 0 ? (
                <div className="palette-empty palette-empty--inline">
                  No FalkorDB graphs for this user
                </div>
              ) : (
                userGraphs.map((graphId) => (
                  <PaletteGraphEntry key={graphId} title={graphId} subtitle="Decision graph" />
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function isSubagentVisible(item: PaletteItem) {
  return item.category === 'subagent';
}

export function NodePalette() {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    graphs: true,
  });
  const [contextGraphs, setContextGraphs] = useState<ContextGraphSpec[]>([]);
  const [userGraphs, setUserGraphs] = useState<string[]>([]);
  const [graphsLoading, setGraphsLoading] = useState(true);
  const userSlug = DEFAULT_COT_USER_NODE_ID;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setGraphsLoading(true);
      const [ctx, all] = await Promise.all([fetchContextGraphs(), fetchFalkorGraphIds()]);
      if (cancelled) return;
      setContextGraphs(ctx);
      setUserGraphs(filterGraphsForUser(all, userSlug));
      setGraphsLoading(false);
    };
    void load();
    const t = setInterval(() => void load(), 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [userSlug]);

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

  const toggleGroup = (groupId: PaletteToolGroup | 'graphs') => {
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

            <div className="palette-section">
              <div className="palette-section-title palette-section-title--graphs">
                <span className="palette-section-title__text">Graphs</span>
                <span className="palette-section-title__rule" aria-hidden />
              </div>
              <PaletteGraphsSection
                collapsed={!isSearching && Boolean(collapsedGroups.graphs)}
                onToggle={() => toggleGroup('graphs')}
                contextGraphs={contextGraphs}
                userGraphs={userGraphs}
                userSlug={userSlug}
                loading={graphsLoading}
              />
            </div>

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
