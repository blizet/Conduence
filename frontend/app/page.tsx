'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { layoutTree } from './lib/tree-layout';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const WS = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000/ws';
const PUBLISHER_USER = process.env.NEXT_PUBLIC_PUBLISHER_USER_ID ?? 'user_117';
const SEEKER_USER = process.env.NEXT_PUBLIC_SEEKER_USER_ID ?? 'User_902';
const PUBLISHER_GRAPH = process.env.NEXT_PUBLIC_GRAPH_ID ?? 'user_117.publisher.v1';
const SEEKER_GRAPH = process.env.NEXT_PUBLIC_SEEKER_GRAPH_ID ?? 'user_902.seeker.v1';
const PUBLISHER_TOPIC = 'market.signals.public';

type FeedItem = { decision_id: string; updated_at: string; graph_id: string };

function toFalkorName(graphId: string): string {
  return graphId.replace(/[^a-zA-Z0-9_]/g, '_');
}

type GraphPanelProps = {
  title: string;
  graphId: string;
  accent: string;
  reloadToken: number;
  gridArea: string;
  showRightBorder?: boolean;
};

function GraphPanel({
  title,
  graphId,
  accent,
  reloadToken,
  gridArea,
  showRightBorder = true,
}: GraphPanelProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [error, setError] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/graphs/${encodeURIComponent(graphId)}/snapshot`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      const { nodes: treeNodes, edges: treeEdges } = layoutTree(
        data.nodes ?? [],
        data.edges ?? [],
        accent,
      );
      setNodes(treeNodes);
      setEdges(treeEdges);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load graph');
      setNodes([]);
      setEdges([]);
    }
  }, [graphId, accent, setNodes, setEdges]);

  useEffect(() => {
    loadSnapshot().catch(console.error);
  }, [loadSnapshot, reloadToken]);

  return (
    <div
      style={{
        gridArea,
        position: 'relative',
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        borderRight: showRightBorder ? '1px solid #343a40' : undefined,
        display: 'flex',
        flexDirection: 'column',
        background: '#0f1117',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #343a40',
          background: '#1a1d24',
          flexShrink: 0,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, color: accent }}>{title}</div>
        <div style={{ fontSize: 10, color: '#868e96' }}>{graphId}</div>
        <div style={{ fontSize: 10, color: '#868e96' }}>
          {nodes.length} nodes · {edges.length} edges
          {error && <span style={{ color: '#ff6b6b', marginLeft: 6 }}>{error}</span>}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {nodes.length === 0 && !error ? (
          <div style={{ padding: 16, color: '#868e96', fontSize: 11, lineHeight: 1.5 }}>
            No data yet for <code style={{ color: '#ced4da' }}>{graphId}</code>.
            <br />
            1) <code>npm run dev:backend</code> (wait for workers)
            <br />
            2) <code>npm run seed</code> in another terminal
            <br />
            3) Refresh this page. Check <code>frontend/.env.local</code> matches graph id.
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
            proOptions={{ hideAttribution: true }}
            style={{ width: '100%', height: '100%' }}
          >
            <Background color="#343a40" gap={20} />
            <Controls position="bottom-left" />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [status, setStatus] = useState('connecting');
  const [reloadPublisher, setReloadPublisher] = useState(0);
  const [reloadSeeker, setReloadSeeker] = useState(0);

  useEffect(() => {
    const ws = new WebSocket(WS);
    ws.onopen = () => setStatus('live');
    ws.onclose = () => setStatus('disconnected');
    ws.onmessage = (msg) => {
      const event = JSON.parse(msg.data);
      if (event.type === 'decision.ingested' || event.type === 'cot.produced') {
        if (event.type === 'decision.ingested') {
          setFeed((prev) => [
            {
              decision_id: event.decision_id,
              updated_at: event.updated_at,
              graph_id: event.graph_id,
            },
            ...prev.slice(0, 49),
          ]);
        }
        const gid = event.graph_id;
        if (gid === PUBLISHER_GRAPH) {
          setReloadPublisher((n) => n + 1);
        }
        if (gid === SEEKER_GRAPH) {
          setReloadSeeker((n) => n + 1);
        }
      }
    };
    return () => ws.close();
  }, []);

  return (
    <div
      style={{
        display: 'grid',
        height: '100vh',
        width: '100%',
        overflow: 'hidden',
        gridTemplateColumns: 'minmax(0, 45%) minmax(0, 45%) minmax(0, 10%)',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        gridTemplateAreas: `
          "header header header"
          "publisher seeker feed"
        `,
      }}
    >
      <header
        style={{
          gridArea: 'header',
          padding: '10px 16px',
          borderBottom: '1px solid #343a40',
          background: '#1a1d24',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          minWidth: 0,
        }}
      >
        <strong>CoT Decision Graphs</strong>
        <span style={{ color: status === 'live' ? '#51cf66' : '#ffa94d', fontSize: 13 }}>{status}</span>
        <span style={{ fontSize: 11, color: '#868e96' }}>
          Publisher {PUBLISHER_USER} · Seeker {SEEKER_USER}
        </span>
      </header>

      <GraphPanel
        gridArea="publisher"
        title={`Publisher · ${PUBLISHER_USER}`}
        graphId={PUBLISHER_GRAPH}
        accent="#748ffc"
        reloadToken={reloadPublisher}
        showRightBorder
      />
      <GraphPanel
        gridArea="seeker"
        title={`Seeker · ${SEEKER_USER}`}
        graphId={SEEKER_GRAPH}
        accent="#63e6be"
        reloadToken={reloadSeeker}
        showRightBorder={false}
      />

      <aside
        style={{
          gridArea: 'feed',
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid #343a40',
          background: '#14161c',
        }}
      >
        <div
          style={{
            padding: '8px 8px',
            borderBottom: '1px solid #343a40',
            flexShrink: 0,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          Feed
        </div>
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '6px 6px' }}>
          {feed.length === 0 && (
            <p style={{ color: '#868e96', fontSize: 10, margin: '8px 4px' }}>
              Waiting for decisions…
            </p>
          )}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {feed.map((item) => {
              const isPublisher = item.graph_id === PUBLISHER_GRAPH;
              const isSeeker = item.graph_id === SEEKER_GRAPH;
              return (
                <li
                  key={item.decision_id}
                  style={{
                    marginBottom: 6,
                    padding: '6px 4px',
                    background: '#1a1d24',
                    borderRadius: 4,
                    fontSize: 9,
                    borderLeft: `2px solid ${isPublisher ? '#748ffc' : isSeeker ? '#63e6be' : '#495057'}`,
                    overflow: 'hidden',
                    wordBreak: 'break-all',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{item.decision_id}</div>
                  <div style={{ color: '#868e96' }}>{isPublisher ? 'pub' : isSeeker ? 'seek' : '?'}</div>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}
