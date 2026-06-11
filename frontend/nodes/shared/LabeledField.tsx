'use client';

import type { ReactNode } from 'react';
import { stopNodeKeyPropagation } from './useNodeData';

type LabeledInputProps = {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  inline?: boolean;
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
  onChange,
}: LabeledInputProps) {
  return (
    <div
      className={`node-field${inline ? ' node-field--inline' : ''}`}
      onKeyDown={stopNodeKeyPropagation}
    >
      <div className="node-field__label">{label}</div>
      <input
        className="node-input nodrag"
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={stopNodeKeyPropagation}
      />
    </div>
  );
}

type LabeledTextareaProps = {
  label: string;
  value: string;
  placeholder?: string;
  rows?: number;
  onChange: (value: string) => void;
};

export function LabeledTextarea({
  label,
  value,
  placeholder,
  rows = 3,
  onChange,
}: LabeledTextareaProps) {
  return (
    <div className="node-field" onKeyDown={stopNodeKeyPropagation}>
      <div className="node-field__label">{label}</div>
      <textarea
        className="node-textarea nodrag nowheel"
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={stopNodeKeyPropagation}
      />
    </div>
  );
}

type LabeledSelectProps = {
  label: string;
  value: string;
  inline?: boolean;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
};

export function LabeledSelect({
  label,
  value,
  inline = false,
  options,
  onChange,
}: LabeledSelectProps) {
  return (
    <div
      className={`node-field${inline ? ' node-field--inline' : ''}`}
      onKeyDown={stopNodeKeyPropagation}
    >
      <div className="node-field__label">{label}</div>
      <select
        className="node-input nodrag"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={stopNodeKeyPropagation}
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
