import { useEffect, useState } from "react";

import {
  defaultModelFor,
  LLM_PROVIDERS,
  loadStoredLlmSettings,
  normalizeProvider,
  saveStoredLlmSettings,
  type LlmProvider,
  type LlmSettingsInput,
} from "../shared/llm";

export interface ProviderOption {
  id: LlmProvider;
  label: string;
  defaultModel: string;
  keyPlaceholder?: string;
}

interface LlmSettingsPanelProps {
  settings: LlmSettingsInput;
  onChange: (settings: LlmSettingsInput) => void;
  providers: ProviderOption[];
  envFallbackConfigured: boolean;
}

export function LlmSettingsPanel({
  settings,
  onChange,
  providers,
  envFallbackConfigured,
}: LlmSettingsPanelProps) {
  const [open, setOpen] = useState(() => !settings.apiKey?.trim() && !envFallbackConfigured);
  const provider = normalizeProvider(settings.provider);
  const providerMeta =
    LLM_PROVIDERS.find((p) => p.id === provider) ??
    providers.find((p) => p.id === provider) ??
    LLM_PROVIDERS[0];
  const hasKey = Boolean(settings.apiKey?.trim()) || envFallbackConfigured;

  return (
    <section className="llm-settings">
      <button
        type="button"
        className="llm-settings-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>
          LLM: {providerMeta.label}
          {hasKey ? " · key set" : " · key required"}
        </span>
        <span>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="llm-settings-body">
          <label>
            Provider
            <select
              value={provider}
              onChange={(e) => {
                const next = normalizeProvider(e.target.value);
                onChange({
                  ...settings,
                  provider: next,
                  model: defaultModelFor(next),
                });
              }}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            API key
            <input
              type="password"
              autoComplete="off"
              placeholder={providerMeta.keyPlaceholder}
              value={settings.apiKey ?? ""}
              onChange={(e) => onChange({ ...settings, apiKey: e.target.value })}
            />
          </label>

          <label>
            Model
            <input
              type="text"
              placeholder={providerMeta.defaultModel}
              value={settings.model ?? ""}
              onChange={(e) => onChange({ ...settings, model: e.target.value })}
            />
          </label>

          {envFallbackConfigured && !settings.apiKey?.trim() && (
            <p className="muted small">
              No key entered — using <code>LLM_API_KEY</code> from <code>supermemory/.env</code> as
              fallback.
            </p>
          )}

          <p className="muted small">Keys stay in your browser (localStorage), not on the server.</p>
        </div>
      )}
    </section>
  );
}

export function useLlmSettings() {
  const [settings, setSettings] = useState<LlmSettingsInput>(() => loadStoredLlmSettings());

  useEffect(() => {
    saveStoredLlmSettings(settings);
  }, [settings]);

  return [settings, setSettings] as const;
}
