'use client';

import { useEffect, useRef, useState } from 'react';

const DEFAULT_WORKFLOW_NAME = 'Workflow';

type WorkflowDockProps = {
  activeWorkflowName: string;
  workflowIndex: number;
  workflowCount: number;
  workflowLive: boolean;
  onRenameWorkflow: (name: string) => void;
  onPrevWorkflow: () => void;
  onNextWorkflow: () => void;
  onNewWorkflow: () => void;
  onDeleteWorkflow: () => void;
};

function ChevronLeft() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M7.5 2.5L4 6l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4.5 2.5L8 6l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WorkflowDock({
  activeWorkflowName,
  workflowIndex,
  workflowCount,
  workflowLive,
  onRenameWorkflow,
  onPrevWorkflow,
  onNextWorkflow,
  onNewWorkflow,
  onDeleteWorkflow,
}: WorkflowDockProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const canGoPrev = workflowIndex > 0;
  const canGoNext = workflowIndex >= 0 && workflowIndex < workflowCount - 1;
  const displayName = activeWorkflowName.trim() || DEFAULT_WORKFLOW_NAME;

  useEffect(() => {
    if (editing) nameInputRef.current?.select();
  }, [editing]);

  const finishEditing = () => setEditing(false);

  const handleConfirmDelete = () => {
    onDeleteWorkflow();
    setConfirmDelete(false);
  };

  return (
    <>
      <div className="workflow-dock" role="region" aria-label="Workflow">
        <button
          type="button"
          className="workflow-dock__nav"
          onClick={onPrevWorkflow}
          disabled={workflowLive || !canGoPrev}
          title="Previous workflow"
          aria-label="Previous workflow"
        >
          <ChevronLeft />
        </button>

        {editing ? (
          <input
            ref={nameInputRef}
            className="workflow-dock__name-input"
            value={activeWorkflowName}
            onChange={(e) => onRenameWorkflow(e.target.value)}
            onBlur={finishEditing}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') finishEditing();
            }}
            disabled={workflowLive}
            aria-label="Workflow name"
          />
        ) : (
          <button
            type="button"
            className="workflow-dock__name"
            onClick={() => !workflowLive && setEditing(true)}
            disabled={workflowLive}
            title={workflowLive ? 'Stop Live to rename' : 'Click to rename'}
          >
            {displayName}
          </button>
        )}

        <button
          type="button"
          className="workflow-dock__nav"
          onClick={onNextWorkflow}
          disabled={workflowLive || !canGoNext}
          title="Next workflow"
          aria-label="Next workflow"
        >
          <ChevronRight />
        </button>

        <button
          type="button"
          className="workflow-dock__add"
          onClick={onNewWorkflow}
          disabled={workflowLive}
          title="New workflow"
          aria-label="New workflow"
        >
          +
        </button>

        <button
          type="button"
          className="workflow-dock__delete"
          onClick={() => setConfirmDelete(true)}
          disabled={workflowLive}
          title="Delete workflow"
          aria-label="Delete workflow"
        >
          ×
        </button>
      </div>

      {confirmDelete ? (
        <div className="marketplace-overlay" onClick={() => setConfirmDelete(false)} role="presentation">
          <div
            className="workflow-delete-confirm glass"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="workflow-delete-title"
            aria-describedby="workflow-delete-desc"
          >
            <h2 id="workflow-delete-title" className="workflow-delete-confirm__title">
              Do you want to delete?
            </h2>
            <p id="workflow-delete-desc" className="workflow-delete-confirm__text">
              <strong>{displayName}</strong> will be removed permanently.
            </p>
            <div className="workflow-delete-confirm__actions">
              <button
                type="button"
                className="graph-view-toggle"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="graph-view-toggle workflow-delete-confirm__delete"
                onClick={handleConfirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
