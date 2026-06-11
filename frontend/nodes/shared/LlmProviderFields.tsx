'use client';

import {
  DEFAULT_LLM_PROVIDER,
  LLM_MODELS,
  LLM_PROVIDERS,
  defaultModelForProvider,
  normalizeProvider,
  type LlmProvider,
} from '@/lib/llm-providers';
import { ApiKeyField } from './ApiKeyField';
import { LabeledInput, LabeledInputRow, LabeledSelect } from './LabeledField';

type LlmProviderFieldsProps = {
  provider?: string;
  model?: string;
  apiKey?: string;
  temperature?: string;
  maxTokens?: string;
  showSampling?: boolean;
  apiKeyLabel?: string;
  onProviderChange: (provider: LlmProvider) => void;
  onModelChange: (model: string) => void;
  onApiKeyChange: (key: string) => void;
  onTemperatureChange?: (value: string) => void;
  onMaxTokensChange?: (value: string) => void;
};

export function LlmProviderFields({
  provider,
  model,
  apiKey,
  temperature,
  maxTokens,
  showSampling = false,
  apiKeyLabel = 'LLM API key',
  onProviderChange,
  onModelChange,
  onApiKeyChange,
  onTemperatureChange,
  onMaxTokensChange,
}: LlmProviderFieldsProps) {
  const activeProvider = normalizeProvider(provider);
  const models = LLM_MODELS[activeProvider];
  const modelOptions = [...models, { id: '__custom__', label: 'Custom model…' }];
  const isCustom = model ? !models.some((m) => m.id === model) : false;
  const selectValue = isCustom ? '__custom__' : (model || defaultModelForProvider(activeProvider));

  const handleProviderChange = (next: string) => {
    const p = normalizeProvider(next);
    onProviderChange(p);
    if (!model || models.some((m) => m.id === model)) {
      onModelChange(defaultModelForProvider(p));
    }
  };

  return (
    <>
      <LabeledSelect
        label="LLM provider"
        value={activeProvider}
        options={LLM_PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
        onChange={handleProviderChange}
      />
      <LabeledSelect
        label="Model"
        value={selectValue}
        options={modelOptions.map((m) => ({ value: m.id, label: m.label }))}
        onChange={(v) => {
          if (v === '__custom__') {
            onModelChange(model || '');
          } else {
            onModelChange(v);
          }
        }}
      />
      {selectValue === '__custom__' ? (
        <LabeledInput
          label="Custom model ID"
          placeholder={
            activeProvider === 'openai'
              ? 'gpt-4o-mini'
              : activeProvider === 'claude'
                ? 'claude-3-5-haiku-latest'
                : 'gemini-2.0-flash'
          }
          value={model ?? ''}
          onChange={onModelChange}
        />
      ) : null}
      <ApiKeyField
        label={apiKeyLabel}
        value={apiKey ?? ''}
        placeholder={
          activeProvider === 'openai'
            ? 'sk-…'
            : activeProvider === 'claude'
              ? 'sk-ant-…'
              : 'Gemini API key…'
        }
        onChange={onApiKeyChange}
      />
      {showSampling && onTemperatureChange && onMaxTokensChange ? (
        <LabeledInputRow>
          <LabeledInput
            label="Temperature"
            inline
            placeholder="0.7"
            value={temperature ?? ''}
            onChange={onTemperatureChange}
          />
          <LabeledInput
            label="Max tokens"
            inline
            placeholder="2048"
            value={maxTokens ?? ''}
            onChange={onMaxTokensChange}
          />
        </LabeledInputRow>
      ) : null}
      <div className="node-field__hint">
        Provider: {LLM_PROVIDERS.find((p) => p.id === activeProvider)?.label ?? DEFAULT_LLM_PROVIDER}
        {' · '}
        Key stays on this node (not sent to logs)
      </div>
    </>
  );
}
