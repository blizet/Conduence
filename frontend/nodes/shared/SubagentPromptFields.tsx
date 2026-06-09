'use client';

import { PromptField } from './PromptField';

type SubagentPromptFieldsProps = {
  systemPrompt: string;
  userPrompt: string;
  defaultSystem: string;
  defaultUser: string;
  onSystemChange: (value: string) => void;
  onUserChange: (value: string) => void;
};

export function SubagentPromptFields({
  systemPrompt,
  userPrompt,
  defaultSystem,
  defaultUser,
  onSystemChange,
  onUserChange,
}: SubagentPromptFieldsProps) {
  return (
    <>
      <PromptField
        label="Harness (system prompt)"
        value={systemPrompt || defaultSystem}
        rows={4}
        onChange={onSystemChange}
      />
      <PromptField
        label="User prompt"
        value={userPrompt || defaultUser}
        rows={3}
        onChange={onUserChange}
      />
      <div className="node-field__hint">
        Harness defines role + output schema · user prompt injects workflow context
      </div>
    </>
  );
}
