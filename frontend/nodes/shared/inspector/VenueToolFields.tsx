'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Edge } from '@xyflow/react';
import {
  resolveAgentTradePayload,
  runExecutionToolFromAgent,
  upstreamAgentForExecutionTool,
} from '@/lib/execution-tools';
import { clearFetchState, toolResultPatch } from '@/lib/workflow-tools';
import type { OrchestratorRunResult } from '@/lib/orchestrator-runner';
import { ApiKeyField } from '../ApiKeyField';
import { FetchResultPanel } from '../FetchResultPanel';
import { GuideField } from './GuideField';
import { LabeledInput, LabeledInputRow } from '../LabeledField';
import { stopNodeKeyPropagation } from '../useNodeData';
import type { WorkflowNode, WorkflowNodeData } from '../../types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type VenueFieldsProps = {
  nodeId: string;
  nodeType: 'clob' | 'kalshi' | 'telegram';
  data: WorkflowNodeData;
  accent: string;
  nodes: WorkflowNode[];
  edges: Edge[];
  feedSignals?: Record<string, { latest?: unknown }>;
  orchResult?: OrchestratorRunResult;
  onPatch: (patch: Partial<WorkflowNodeData>) => void;
};

function useUpstreamPayload({
  nodeId,
  nodes,
  edges,
  feedSignals,
  orchResult,
}: Pick<VenueFieldsProps, 'nodeId' | 'nodes' | 'edges' | 'feedSignals' | 'orchResult'>) {
  return useMemo(() => {
    const source = upstreamAgentForExecutionTool(nodeId, nodes, edges);
    if (!source) return { source: null, payload: null };
    return {
      source,
      payload: resolveAgentTradePayload(source, orchResult, feedSignals),
    };
  }, [nodeId, nodes, edges, feedSignals, orchResult]);
}

function ExecutionToolFields({
  nodeId,
  nodeType,
  data,
  accent,
  nodes,
  edges,
  feedSignals,
  orchResult,
  onPatch,
  venueLabel,
  credentialFields,
  defaultFields,
}: VenueFieldsProps & {
  venueLabel: string;
  credentialFields: React.ReactNode;
  defaultFields: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const { source, payload } = useUpstreamPayload({
    nodeId,
    nodes,
    edges,
    feedSignals,
    orchResult,
  });

  const runExecution = useCallback(async () => {
    if (!source) {
      onPatch({
        clobStatus: 'Connect an agent to the Input port',
        kalshiStatus: 'Connect an agent to the Input port',
        telegramStatus: 'Connect an agent to the Input port',
      });
      return;
    }
    if (!payload) {
      onPatch({
        clobStatus: 'No trade payload from connected agent yet — run the workflow first',
        kalshiStatus: 'No trade payload from connected agent yet — run the workflow first',
        telegramStatus: 'No agent payload yet — run the workflow first',
      });
      return;
    }

    setBusy(true);
    onPatch({
      ...clearFetchState(),
      clobStatus: 'Submitting…',
      kalshiStatus: 'Submitting…',
      telegramStatus: 'Sending…',
    });
    try {
      const result = await runExecutionToolFromAgent(
        nodeType,
        { ...data, backendUrl: data.backendUrl ?? API },
        payload,
        data.backendUrl ?? API,
      );
      const statusKey =
        nodeType === 'clob' ? 'clobStatus' : nodeType === 'kalshi' ? 'kalshiStatus' : 'telegramStatus';
      const body = result.data && typeof result.data === 'object' ? (result.data as Record<string, unknown>) : null;
      const statusMsg = String(
        body?.message ?? body?.error ?? (result.ok ? (nodeType === 'telegram' ? 'Message sent' : 'Order submitted') : result.error ?? 'Failed'),
      );
      onPatch({
        ...toolResultPatch(result),
        [statusKey]: statusMsg,
      });
    } catch (err) {
      onPatch({
        workflowStatus: 'error',
        workflowError: err instanceof Error ? err.message : 'Request failed',
      });
    } finally {
      setBusy(false);
    }
  }, [data, nodeType, onPatch, payload, source]);

  return (
    <div onKeyDown={stopNodeKeyPropagation}>
      <GuideField field="Input port">
        <p className="node-field__hint">
          Wire an agent output → <strong>Input</strong>.
          {nodeType === 'telegram'
            ? ' Telegram formats the agent payload and sends it via your bot.'
            : ` ${venueLabel} reads the agent trade JSON and submits an order in ${venueLabel} format.`}
        </p>
        {source ? (
          <p className="node-field__hint">
            Connected: <strong>{source.data.label ?? source.type}</strong>
            {payload ? ' · trade payload ready' : ' · awaiting agent decision'}
          </p>
        ) : (
          <p className="node-field__hint">No agent connected to Input.</p>
        )}
      </GuideField>
      {payload ? (
        <pre className="node-field__preview">{JSON.stringify(payload, null, 2)}</pre>
      ) : null}
      {defaultFields}
      {credentialFields}
      <button
        type="button"
        className="node-add-btn"
        style={{ marginTop: 4, borderColor: `${accent}55`, color: accent }}
        disabled={busy || !source || !payload}
        onClick={() => void runExecution()}
      >
        {busy ? 'Executing…' : nodeType === 'telegram' ? 'Send to Telegram' : `Execute on ${venueLabel}`}
      </button>
      <FetchResultPanel
        status={data.workflowStatus}
        error={data.workflowError}
        result={data.workflowResult}
        durationMs={data.workflowDurationMs}
      />
    </div>
  );
}

export function ClobInspectorFields(props: Omit<VenueFieldsProps, 'nodeType' | 'venueLabel'>) {
  return (
    <ExecutionToolFields
      {...props}
      nodeType="clob"
      venueLabel="Polymarket"
      defaultFields={
        <LabeledInputRow>
          <LabeledInput
            label="Default size"
            inline
            placeholder="100"
            value={props.data.tradeSize ?? ''}
            onChange={(v) => props.onPatch({ tradeSize: v })}
          />
          <LabeledInput
            label="Default price"
            inline
            placeholder="0.50"
            value={props.data.tradePrice ?? ''}
            onChange={(v) => props.onPatch({ tradePrice: v })}
          />
        </LabeledInputRow>
      }
      credentialFields={
        <>
          <ApiKeyField
            label="Polymarket API key"
            guideField="Polymarket API key"
            value={props.data.apiKey ?? ''}
            onChange={(v) => props.onPatch({ apiKey: v })}
          />
          <ApiKeyField
            label="Polymarket secret"
            guideField="Polymarket secret"
            value={props.data.apiSecret ?? ''}
            placeholder="API secret…"
            onChange={(v) => props.onPatch({ apiSecret: v })}
          />
          <ApiKeyField
            label="Passphrase"
            guideField="Passphrase"
            value={props.data.apiPassphrase ?? ''}
            placeholder="API passphrase…"
            onChange={(v) => props.onPatch({ apiPassphrase: v })}
          />
        </>
      }
    />
  );
}

export function KalshiInspectorFields(props: Omit<VenueFieldsProps, 'nodeType' | 'venueLabel'>) {
  return (
    <ExecutionToolFields
      {...props}
      nodeType="kalshi"
      venueLabel="Kalshi"
      defaultFields={
        <LabeledInputRow>
          <LabeledInput
            label="Default contracts"
            inline
            placeholder="10"
            value={props.data.kalshiCount ?? props.data.tradeSize ?? ''}
            onChange={(v) => props.onPatch({ kalshiCount: v })}
          />
          <LabeledInput
            label="Default limit (¢)"
            inline
            placeholder="50"
            value={props.data.kalshiPrice ?? props.data.tradePrice ?? ''}
            onChange={(v) => props.onPatch({ kalshiPrice: v })}
          />
        </LabeledInputRow>
      }
      credentialFields={
        <>
          <ApiKeyField
            label="Kalshi API key ID"
            guideField="Kalshi API key ID"
            value={props.data.apiKey ?? ''}
            onChange={(v) => props.onPatch({ apiKey: v })}
          />
          <ApiKeyField
            label="Kalshi private key (PEM)"
            guideField="Kalshi private key (PEM)"
            value={props.data.apiSecret ?? ''}
            placeholder="-----BEGIN RSA PRIVATE KEY-----…"
            onChange={(v) => props.onPatch({ apiSecret: v })}
          />
        </>
      }
    />
  );
}

export function TelegramInspectorFields(props: Omit<VenueFieldsProps, 'nodeType' | 'venueLabel'>) {
  return (
    <ExecutionToolFields
      {...props}
      nodeType="telegram"
      venueLabel="Telegram"
      defaultFields={
        <>
          <LabeledInput
            label="Telegram username"
            guideField="Telegram username"
            placeholder="your_username (without @)"
            value={props.data.telegramUsername ?? ''}
            onChange={(v) => props.onPatch({ telegramUsername: v })}
          />
          <LabeledInput
            label="Chat ID (optional)"
            guideField="Chat ID (optional)"
            placeholder="Numeric ID after /start with bot"
            value={props.data.telegramChatId ?? ''}
            onChange={(v) => props.onPatch({ telegramChatId: v })}
          />
          <LabeledInput
            label="Message prefix"
            placeholder="e.g. Trade alert"
            value={props.data.telegramMessagePrefix ?? ''}
            onChange={(v) => props.onPatch({ telegramMessagePrefix: v })}
          />
        </>
      }
      credentialFields={
        <ApiKeyField
          label="Bot token"
          guideField="Bot token"
          value={props.data.apiKey ?? ''}
          placeholder="123456:ABC… from @BotFather"
          onChange={(v) => props.onPatch({ apiKey: v })}
        />
      }
    />
  );
}
