'use client';

import { stopNodeKeyPropagation } from './useNodeData';
import type { WorkflowNodeData } from '../types';

type FetchResultPanelProps = {
  status?: WorkflowNodeData['workflowStatus'];
  error?: string;
  result?: string;
  durationMs?: number;
  label?: string;
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function FetchResultPanel({
  status,
  error,
  result,
  durationMs,
  label = 'Response',
}: FetchResultPanelProps) {
  if (!status && !result) return null;

  const statusText =
    status === 'running'
      ? 'Running…'
      : status === 'error'
        ? error || 'Request failed'
        : status === 'success'
          ? 'Success'
          : status;

  return (
    <div className="node-field" style={{ marginTop: 8 }} onKeyDown={stopNodeKeyPropagation}>
      {(statusText || durationMs != null) && (
        <div
          className={`node-field__hint${status === 'error' ? ' node-field__hint--error' : ''}${status === 'success' ? ' node-field__hint--success' : ''}`}
        >
          {statusText}
          {durationMs != null ? ` · ${formatDuration(durationMs)}` : ''}
        </div>
      )}
      {result ? (
        <>
          <div className="node-field__label">{label}</div>
          <textarea
            className="node-textarea nodrag nowheel node-fetch-result"
            rows={6}
            readOnly
            value={result}
          />
        </>
      ) : null}
    </div>
  );
}
