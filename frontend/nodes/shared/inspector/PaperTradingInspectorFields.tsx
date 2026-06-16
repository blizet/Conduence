'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Edge } from '@xyflow/react';
import {
  resolveAgentTradePayload,
  upstreamAgentForExecutionTool,
} from '@/lib/execution-tools';
import { executePaperTradingForSession, loadWorkspaces, type PaperWorkspace } from '@/lib/paper-trading';
import { loadSavedWorkflows, type SavedWorkflow } from '@/lib/workflow-storage';
import { toolResultPatch } from '@/lib/workflow-tools';
import type { OrchestratorRunResult } from '@/lib/orchestrator-runner';
import { FetchResultPanel } from '../FetchResultPanel';
import { GuideField } from './GuideField';
import { stopNodeKeyPropagation } from '../useNodeData';
import type { WorkflowNode, WorkflowNodeData } from '../../types';

type PaperTradingInspectorFieldsProps = {
  nodeId: string;
  data: WorkflowNodeData;
  accent: string;
  nodes: WorkflowNode[];
  edges: Edge[];
  feedSignals?: Record<string, { latest?: unknown }>;
  orchResult?: OrchestratorRunResult;
  onPatch: (patch: Partial<WorkflowNodeData>) => void;
};

export function PaperTradingInspectorFields({
  nodeId,
  data,
  accent,
  nodes,
  edges,
  feedSignals,
  orchResult,
  onPatch,
}: PaperTradingInspectorFieldsProps) {
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<PaperWorkspace[]>([]);
  const [workflows, setWorkflows] = useState<SavedWorkflow[]>([]);

  const refresh = useCallback(() => {
    setSessions(loadWorkspaces());
    setWorkflows(loadSavedWorkflows());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const source = useMemo(
    () => upstreamAgentForExecutionTool(nodeId, nodes, edges),
    [nodeId, nodes, edges],
  );

  const payload = useMemo(() => {
    if (!source) return null;
    return resolveAgentTradePayload(source, orchResult, feedSignals);
  }, [source, orchResult, feedSignals]);

  const workflowId = data.paperWorkflowId ?? '';
  const sessionsForWorkflow = useMemo(
    () => (workflowId ? sessions.filter((s) => s.workflowId === workflowId) : sessions),
    [sessions, workflowId],
  );

  const selectedSession = sessions.find(
    (s) => s.id === data.paperSessionId || (workflowId && s.workflowId === workflowId && !data.paperSessionId),
  );

  const selectedWorkflow = workflows.find((w) => w.id === workflowId);

  const onWorkflowChange = (wfId: string) => {
    const match = sessions.find((s) => s.workflowId === wfId);
    onPatch({
      paperWorkflowId: wfId,
      paperSessionId: match?.id ?? '',
    });
  };

  const canExecute = Boolean(workflowId || data.paperSessionId) && source && payload;

  const runPaperTrade = useCallback(async () => {
    if (!workflowId && !data.paperSessionId) {
      onPatch({ paperTradingStatus: 'Select a strategy workflow' });
      return;
    }
    if (!source) {
      onPatch({ paperTradingStatus: 'Connect Orchestrator output → Input (not a sub-agent feed)' });
      return;
    }
    if (source.type !== 'llm') {
      onPatch({
        paperTradingStatus: `Wire Orchestrator to Input — currently connected to ${source.data.label ?? source.type}`,
      });
      return;
    }
    if (!payload) {
      onPatch({
        paperTradingStatus: 'No trade payload yet — run the workflow first',
      });
      return;
    }

    setBusy(true);
    onPatch({ paperTradingStatus: 'Simulating…', workflowStatus: 'running', workflowError: '' });
    try {
      const result = executePaperTradingForSession(
        data.paperSessionId ?? '',
        payload as Record<string, unknown>,
        workflowId,
      );
      if (!result.ok) {
        onPatch({
          paperTradingStatus: result.error ?? 'Paper trade failed',
          workflowStatus: 'error',
          workflowError: result.error ?? 'Paper trade failed',
        });
        return;
      }
      const body = result.data ?? {};
      const msg = String(body.message ?? 'Done');
      onPatch({
        ...toolResultPatch({
          ok: true,
          source: 'paperTrading',
          request: { sessionId: data.paperSessionId, workflowId },
          data: body,
        }),
        paperTradingStatus: msg,
        paperSessionId: String(body.sessionId ?? data.paperSessionId ?? ''),
      });
      refresh();
    } catch (err) {
      onPatch({
        workflowStatus: 'error',
        workflowError: err instanceof Error ? err.message : 'Request failed',
        paperTradingStatus: 'Failed',
      });
    } finally {
      setBusy(false);
    }
  }, [data.paperSessionId, onPatch, payload, refresh, source, workflowId]);

  return (
    <div onKeyDown={stopNodeKeyPropagation}>
      <GuideField field="Input port">
        <p className="node-field__hint">
          Wire <strong>Orchestrator</strong> output → <strong>Input</strong>. Sub-agent feeds (e.g.
          News Agent) should connect to Orchestrator Tools, not directly here.
        </p>
        {source ? (
          <p className="node-field__hint">
            Connected: <strong>{source.data.label ?? source.type}</strong>
            {source.type !== 'llm' ? ' · connect Orchestrator instead' : ''}
            {payload ? ' · trade payload ready' : ' · awaiting decision'}
          </p>
        ) : (
          <p className="node-field__hint">No agent connected to Input.</p>
        )}
      </GuideField>

      <GuideField field="Strategy workflow">
        <select
          className="cot-graph-sidebar__input"
          value={workflowId}
          onChange={(e) => onWorkflowChange(e.target.value)}
        >
          <option value="">Select saved workflow…</option>
          {workflows.map((wf) => (
            <option key={wf.id} value={wf.id}>
              {wf.name} ({wf.canvas.nodes.length} nodes)
            </option>
          ))}
        </select>
        {selectedWorkflow ? (
          <p className="node-field__hint">
            Paper trades use capital and risk limits from the matching session on Paper Trading.
          </p>
        ) : null}
      </GuideField>

      <GuideField field="Paper session">
        <select
          className="cot-graph-sidebar__input"
          value={data.paperSessionId ?? ''}
          onChange={(e) => onPatch({ paperSessionId: e.target.value })}
          disabled={!workflowId && sessions.length === 0}
        >
          <option value="">
            {workflowId ? 'Auto (first session for workflow)' : 'Select session…'}
          </option>
          {(workflowId ? sessionsForWorkflow : sessions).map((session) => (
            <option key={session.id} value={session.id}>
              {session.name}
              {session.workflowName ? ` · ${session.workflowName}` : ''}
            </option>
          ))}
        </select>
        {selectedSession ? (
          <p className="node-field__hint">
            Session: {selectedSession.name} · {selectedSession.platform}
          </p>
        ) : workflowId && sessionsForWorkflow.length === 0 ? (
          <p className="node-field__hint">
            No session for this workflow.{' '}
            <Link href="/simulate" className="paper-strategy__link">Create on Paper Trading</Link>
          </p>
        ) : (
          <p className="node-field__hint">
            <Link href="/simulate" className="paper-strategy__link">Paper Trading</Link> — set bankroll
            and risk limits per session.
          </p>
        )}
        <button type="button" className="graph-view-toggle" style={{ marginTop: 8 }} onClick={refresh}>
          Refresh lists
        </button>
      </GuideField>

      {payload ? (
        <pre className="node-field__preview">{JSON.stringify(payload, null, 2)}</pre>
      ) : null}

      <button
        type="button"
        className="node-add-btn"
        style={{ marginTop: 4, borderColor: `${accent}55`, color: accent }}
        disabled={busy || !canExecute}
        onClick={() => void runPaperTrade()}
      >
        {busy ? 'Simulating…' : 'Execute paper trade'}
      </button>

      {data.paperTradingStatus ? (
        <p className="node-field__hint" style={{ marginTop: 8 }}>{data.paperTradingStatus}</p>
      ) : null}

      <FetchResultPanel
        status={data.workflowStatus}
        error={data.workflowError}
        result={data.workflowResult}
        durationMs={data.workflowDurationMs}
      />
    </div>
  );
}
