'use client';

import { useCallback, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import {
  DEFAULT_COT_CORRELATED_JSON,
  DEFAULT_COT_DECISION_JSON,
  DEFAULT_COT_GRAPH_ID,
  DEFAULT_COT_USER_NODE_ID,
} from '../constants';
import { FetchResultPanel } from '../shared/FetchResultPanel';
import { GlassNode } from '../shared/GlassNode';
import { LabeledInput, LabeledInputRow } from '../shared/LabeledField';
import { PromptField } from '../shared/PromptField';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode } from '../types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function CotIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="4" cy="4" r="2" />
      <circle cx="12" cy="4" r="2" />
      <circle cx="8" cy="12" r="2" />
      <path d="M5.5 5.5L7 10M10.5 5.5L9 10M6 4h4" />
    </svg>
  );
}

export function CotBuilderNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const updateData = useNodeData(id);
  const [busy, setBusy] = useState(false);

  const buildAndEmit = useCallback(async () => {
    setBusy(true);
    const started = performance.now();
    updateData({ cotStatus: 'Building…', workflowStatus: 'running', workflowResult: '', workflowDurationMs: undefined });

    try {
      const backendUrl = (data.backendUrl ?? API).replace(/\/$/, '');
      let decision: unknown;
      let correlated: unknown;

      try {
        decision = JSON.parse(data.decisionJson ?? DEFAULT_COT_DECISION_JSON);
      } catch {
        updateData({ cotStatus: 'Invalid decision JSON' });
        return;
      }

      try {
        correlated = JSON.parse(data.correlatedJson ?? DEFAULT_COT_CORRELATED_JSON);
      } catch {
        updateData({ cotStatus: 'Invalid correlated markets JSON' });
        return;
      }

      const buildRes = await fetch(`${backendUrl}/api/tools/cot/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          correlated,
          graphId: data.graphId ?? DEFAULT_COT_GRAPH_ID,
          userNodeId: data.userNodeId ?? DEFAULT_COT_USER_NODE_ID,
        }),
      });

      const buildBody = (await buildRes.json()) as {
        hold?: boolean;
        message?: string;
        cot?: unknown;
        error?: string;
      };

      if (!buildRes.ok || buildBody.error) {
        updateData({ cotStatus: buildBody.error ?? `Build failed (${buildRes.status})` });
        return;
      }

      if (buildBody.hold) {
        updateData({
          cotOutput: '',
          cotStatus: buildBody.message ?? 'HOLD — no CoT emitted',
        });
        return;
      }

      const durationMs = Math.round(performance.now() - started);
      const cotJson = JSON.stringify(buildBody.cot, null, 2);
      updateData({
        cotOutput: cotJson,
        cotStatus: 'CoT graph built',
        workflowStatus: 'success',
        workflowError: '',
        workflowResult: cotJson,
        workflowDurationMs: durationMs,
      });

      if (data.autoEmit) {
        const emitRes = await fetch(`${backendUrl}/api/signals/cot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildBody.cot),
        });
        const emitBody = (await emitRes.json()) as {
          produced?: boolean;
          topic?: string;
          error?: string;
        };

        if (!emitRes.ok || emitBody.error) {
          updateData({ cotStatus: emitBody.error ?? `Emit failed (${emitRes.status})` });
          return;
        }

        updateData({
          cotStatus: emitBody.topic
            ? `Emitted → ${emitBody.topic}`
            : 'CoT emitted to event stream',
        });
      }
    } catch (err) {
      updateData({ cotStatus: err instanceof Error ? err.message : 'Request failed' });
    } finally {
      setBusy(false);
    }
  }, [data, updateData]);

  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="tool"
      accent={data.accent}
      icon={<CotIcon />}
      selected={selected}
      wide
      handles={[
        { type: 'target', position: 'left', id: 'in-decision', style: { top: '35%' } },
        { type: 'target', position: 'left', id: 'in-correlated', style: { top: '65%' } },
        { type: 'source', position: 'right', id: 'out-cot' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <LabeledInputRow>
          <LabeledInput
            label="Graph ID"
            inline
            placeholder="user_771.main.v1"
            value={data.graphId ?? DEFAULT_COT_GRAPH_ID}
            onChange={(v) => updateData({ graphId: v })}
          />
          <LabeledInput
            label="User node ID"
            inline
            placeholder="user_771"
            value={data.userNodeId ?? DEFAULT_COT_USER_NODE_ID}
            onChange={(v) => updateData({ userNodeId: v })}
          />
        </LabeledInputRow>
        <LabeledInput
          label="Backend URL"
          placeholder="http://localhost:4000"
          value={data.backendUrl ?? ''}
          onChange={(v) => updateData({ backendUrl: v })}
        />
        <label className="node-checkbox-row">
          <input
            type="checkbox"
            checked={data.autoEmit ?? false}
            onChange={(e) => updateData({ autoEmit: e.target.checked })}
          />
          <span>Auto-emit to Redpanda after build</span>
        </label>
        <PromptField
          label="Decision JSON (from LLM Analyzer)"
          value={data.decisionJson ?? DEFAULT_COT_DECISION_JSON}
          rows={4}
          onChange={(v) => updateData({ decisionJson: v })}
        />
        <PromptField
          label="Correlated markets JSON"
          value={data.correlatedJson ?? DEFAULT_COT_CORRELATED_JSON}
          rows={3}
          onChange={(v) => updateData({ correlatedJson: v })}
        />
        <button
          type="button"
          className="node-add-btn"
          style={{ borderColor: `${data.accent}55`, color: data.accent }}
          disabled={busy}
          onClick={() => void buildAndEmit()}
        >
          {busy ? 'Building…' : data.autoEmit ? 'Build & emit CoT' : 'Build CoT output'}
        </button>
        {data.cotStatus && !data.workflowResult ? (
          <div className="node-field__hint" style={{ marginTop: 4 }}>
            {data.cotStatus}
          </div>
        ) : null}
        <FetchResultPanel
          status={data.workflowStatus}
          error={data.workflowError ?? data.cotStatus}
          result={data.workflowResult ?? data.cotOutput}
          durationMs={data.workflowDurationMs}
          label="CoT output (DecisionEvent)"
        />
        <div className="node-field__hint">decision + correlated in · CoT graph out · U→P→M→T chain</div>
      </div>
    </GlassNode>
  );
}
