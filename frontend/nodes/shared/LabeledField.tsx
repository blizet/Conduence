'use client';

import type { ReactNode } from 'react';
import { stopNodeKeyPropagation } from './useNodeData';
import { useGuideFieldActive, useGuideFieldFocus } from './inspector/InspectorFieldGuideContext';

type LabeledInputProps = {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  inline?: boolean;
  guideField?: string;
  onChange: (value: string) => void;
};

export function LabeledInputRow({ children }: { children: ReactNode }) {
  return <div className="node-input-row node-input-row--labeled">{children}</div>;
}

export function LabeledInput({
  label,
  value,
  placeholder,
  type = 'text',
  inline = false,
  guideField,
  onChange,
}: LabeledInputProps) {
  const fieldKey = guideField ?? label;
  const focus = useGuideFieldFocus(fieldKey);
  const active = useGuideFieldActive(fieldKey);

  return (
    <div
      className={['node-field', inline ? 'node-field--inline' : '', active ? 'node-field--guide-active' : '']
        .filter(Boolean)
        .join(' ')}
      onKeyDown={stopNodeKeyPropagation}
      {...focus}
    >
      <div className="node-field__label">{label}</div>
      <input
        className="node-input nodrag"
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={stopNodeKeyPropagation}
        onFocus={focus.onFocus}
      />
    </div>
  );
}

type LabeledTextareaProps = {
  label: string;
  value: string;
  placeholder?: string;
  rows?: number;
  guideField?: string;
  onChange: (value: string) => void;
};

export function LabeledTextarea({
  label,
  value,
  placeholder,
  rows = 3,
  guideField,
  onChange,
}: LabeledTextareaProps) {
  const fieldKey = guideField ?? label;
  const focus = useGuideFieldFocus(fieldKey);
  const active = useGuideFieldActive(fieldKey);

  return (
    <div
      className={['node-field', active ? 'node-field--guide-active' : ''].filter(Boolean).join(' ')}
      onKeyDown={stopNodeKeyPropagation}
      {...focus}
    >
      <div className="node-field__label">{label}</div>
      <textarea
        className="node-textarea nodrag nowheel"
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={stopNodeKeyPropagation}
        onFocus={focus.onFocus}
      />
    </div>
  );
}

type LabeledSelectProps = {
  label: string;
  value: string;
  inline?: boolean;
  guideField?: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
};

export function LabeledSelect({
  label,
  value,
  inline = false,
  guideField,
  options,
  onChange,
}: LabeledSelectProps) {
  const fieldKey = guideField ?? label;
  const focus = useGuideFieldFocus(fieldKey);
  const active = useGuideFieldActive(fieldKey);

  return (
    <div
      className={['node-field', inline ? 'node-field--inline' : '', active ? 'node-field--guide-active' : '']
        .filter(Boolean)
        .join(' ')}
      onKeyDown={stopNodeKeyPropagation}
      {...focus}
    >
      <div className="node-field__label">{label}</div>
      <select
        className="node-input nodrag"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={stopNodeKeyPropagation}
        onFocus={focus.onFocus}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
