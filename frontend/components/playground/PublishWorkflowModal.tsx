'use client';

import { useState } from 'react';
import type { Edge } from '@xyflow/react';
import type { WorkflowNode } from '@/nodes/types';
import { publishWorkflowToMarketplace, sanitizeCanvasForPublish } from '@/lib/workflow-marketplace';

type PublishWorkflowModalProps = {
  open: boolean;
  onClose: () => void;
  canvas: { nodes: WorkflowNode[]; edges: Edge[] };
  onPublished?: () => void;
};

export function PublishWorkflowModal({
  open,
  onClose,
  canvas,
  onPublished,
}: PublishWorkflowModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [publisher, setPublisher] = useState('');
  const [publishAsMindAgent, setPublishAsMindAgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!open) return null;

  const nodeCount = canvas.nodes.length;
  const edgeCount = canvas.edges.length;

  const handlePublish = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    const result = await publishWorkflowToMarketplace({
      name: name.trim(),
      description: description.trim(),
      publisher: publisher.trim() || undefined,
      publishAsMindAgent,
      canvas: sanitizeCanvasForPublish(canvas),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Publish failed');
      return;
    }
    setSuccess(`Published as ${result.workflow?.id ?? name}`);
    onPublished?.();
    setTimeout(() => {
      setName('');
      setDescription('');
      setPublisher('');
      setPublishAsMindAgent(false);
      setSuccess('');
      onClose();
    }, 1200);
  };

  return (
    <div className="marketplace-overlay" onClick={onClose} role="presentation">
      <div
        className="marketplace-panel glass publish-workflow-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="publish-workflow-title"
      >
        <header className="marketplace-panel__header">
          <div>
            <h2 id="publish-workflow-title" className="marketplace-panel__title">
              Publish workflow
            </h2>
            <p className="marketplace-panel__subtitle">
              Share your canvas on the marketplace — API keys are stripped automatically
            </p>
          </div>
          <button type="button" className="marketplace-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="publish-workflow-form">
          <p className="publish-workflow-form__meta">
            {nodeCount} nodes · {edgeCount} edges
          </p>
          <label className="node-field">
            <span className="node-field__label">Workflow name</span>
            <input
              className="node-input"
              placeholder="e.g. BTC news → LLM → CoT"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="node-field">
            <span className="node-field__label">Description</span>
            <textarea
              className="node-textarea"
              rows={3}
              placeholder="What does this workflow do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="node-field">
            <span className="node-field__label">Publisher (optional)</span>
            <input
              className="node-input"
              placeholder="your_handle"
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
            />
          </label>
          <label className="node-checkbox-row">
            <input
              type="checkbox"
              checked={publishAsMindAgent}
              onChange={(e) => setPublishAsMindAgent(e.target.checked)}
            />
            Publish as mind agent — strategy hidden; subscribers see signals and CoT only
          </label>
          {error && <p className="marketplace-card__error">{error}</p>}
          {success && <p className="publish-workflow-form__success">{success}</p>}
          <div className="publish-workflow-form__actions">
            <button type="button" className="marketplace-btn marketplace-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="marketplace-btn"
              disabled={busy || !name.trim() || nodeCount === 0}
              onClick={() => void handlePublish()}
            >
              {busy ? 'Publishing…' : 'Publish to marketplace'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
