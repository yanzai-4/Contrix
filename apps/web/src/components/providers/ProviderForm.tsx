import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CreateProviderRequest,
  ProviderType,
  UpdateProviderRequest
} from '@contrix/spec-core';
import {
  getProviderPresetById,
  inferProviderPresetId,
  providerPresets
} from '../../config/providerPresets';
import { useProviderStore } from '../../store/useProviderStore';
import { useI18n } from '../../i18n';

const DEFAULT_TIMEOUT_MS = 30000;
const INITIAL_PRESET_ID = 'openai';

interface FormState {
  presetId: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  supportsStructuredOutput: boolean;
  timeoutMs: string;
  headersJson: string;
  notes: string;
}

interface ProviderFormProps {
  onSuccess?: () => void;
  onRequestClose?: () => void;
}

function buildInitialState(presetId = INITIAL_PRESET_ID): FormState {
  const preset = getProviderPresetById(presetId);
  return {
    presetId: preset.id,
    name: preset.label,
    type: preset.defaultProviderType,
    baseUrl: preset.defaultBaseUrl,
    apiKey: '',
    defaultModel: preset.defaultModel,
    supportsStructuredOutput: preset.defaultSupportsStructuredOutput,
    timeoutMs: String(DEFAULT_TIMEOUT_MS),
    headersJson: '{}',
    notes: ''
  };
}

function parseHeaders(headersJson: string): Record<string, string> {
  const trimmed = headersJson.trim();

  if (!trimmed) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('Headers must be valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Headers must be a JSON object.');
  }

  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!key.trim()) {
      throw new Error('Header keys cannot be empty.');
    }

    result[key] = String(value);
  }

  return result;
}

function toFormStateFromProvider(provider: {
  name: string;
  type: ProviderType;
  baseUrl: string | null;
  defaultModel: string;
  supportsStructuredOutput: boolean;
  timeoutMs: number;
  headers: Record<string, string>;
  notes: string | null;
}): FormState {
  return {
    presetId: inferProviderPresetId({ type: provider.type, baseUrl: provider.baseUrl }),
    name: provider.name,
    type: provider.type,
    baseUrl: provider.baseUrl ?? '',
    apiKey: '',
    defaultModel: provider.defaultModel,
    supportsStructuredOutput: provider.supportsStructuredOutput,
    timeoutMs: String(provider.timeoutMs),
    headersJson: JSON.stringify(provider.headers ?? {}, null, 2),
    notes: provider.notes ?? ''
  };
}

export function ProviderForm({ onSuccess, onRequestClose }: ProviderFormProps) {
  const {
    providers,
    editingProviderId,
    submitLoading,
    formError,
    createProvider,
    updateProvider,
    clearFormError,
    cancelEditingProvider
  } = useProviderStore();
  const { t } = useI18n();
  const [formState, setFormState] = useState<FormState>(() => buildInitialState());
  const [localError, setLocalError] = useState<string | null>(null);
  const baseUrlInputRef = useRef<HTMLInputElement | null>(null);

  const editingProvider = useMemo(
    () => providers.find((provider) => provider.id === editingProviderId) ?? null,
    [providers, editingProviderId]
  );

  const selectedPreset = useMemo(
    () => getProviderPresetById(formState.presetId),
    [formState.presetId]
  );

  useEffect(() => {
    if (!editingProvider) {
      setFormState(buildInitialState(formState.presetId || INITIAL_PRESET_ID));
      return;
    }

    setFormState(toFormStateFromProvider(editingProvider));
  }, [editingProvider]);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setFormState((state) => ({ ...state, [key]: value }));
  };

  const handlePresetChange = (presetId: string) => {
    const preset = getProviderPresetById(presetId);

    setFormState((state) => ({
      ...state,
      presetId: preset.id,
      type: preset.defaultProviderType,
      baseUrl: preset.defaultBaseUrl,
      defaultModel: preset.defaultModel,
      supportsStructuredOutput: preset.defaultSupportsStructuredOutput
    }));

    if (preset.isCustom) {
      requestAnimationFrame(() => {
        const input = baseUrlInputRef.current;
        if (!input) {
          return;
        }

        input.focus();
        const length = input.value.length;
        input.setSelectionRange(length, length);
      });
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFormError();
    setLocalError(null);

    const isEditMode = Boolean(editingProvider);

    const name = formState.name.trim();
    const defaultModel = formState.defaultModel.trim();
    const timeoutMs = Number(formState.timeoutMs);
    const baseUrl = formState.baseUrl.trim();

    if (!name) {
      setLocalError(t('Nickname is required.'));
      return;
    }

    if (!defaultModel) {
      setLocalError(t('Default model is required.'));
      return;
    }

    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      setLocalError(t('Timeout must be a positive number.'));
      return;
    }

    if (!baseUrl) {
      setLocalError(t('Base URL is required.'));
      return;
    }

    if (selectedPreset.isCustom && baseUrl === 'https://') {
      setLocalError(
        t(
          'For Custom provider, continue typing a full API base URL.')
      );
      return;
    }

    const apiKey = formState.apiKey.trim();
    if (!isEditMode && !apiKey) {
      setLocalError(t('API key is required.'));
      return;
    }

    let headers: Record<string, string>;

    try {
      headers = parseHeaders(formState.headersJson);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : t('Headers are invalid.'));
      return;
    }

    const commonPayload = {
      name,
      type: formState.type,
      baseUrl,
      defaultModel,
      supportsStructuredOutput: formState.supportsStructuredOutput,
      timeoutMs,
      headers,
      notes: formState.notes.trim() || undefined
    };

    let success = false;

    if (isEditMode && editingProvider) {
      const payload: UpdateProviderRequest = {
        ...commonPayload,
        apiKey: apiKey || undefined
      };
      success = await updateProvider(editingProvider.id, payload);
    } else {
      const payload: CreateProviderRequest = {
        ...commonPayload,
        apiKey
      };
      success = await createProvider(payload);
    }

    if (success) {
      setFormState(buildInitialState(formState.presetId || INITIAL_PRESET_ID));
      setLocalError(null);
      onSuccess?.();
    }
  };

  const handleCancelEdit = () => {
    cancelEditingProvider();
    onRequestClose?.();
  };

  return (
    <section className="panel">
      <h2>
        {editingProvider
          ? t(`Edit Provider: ${editingProvider.name}`)
          : t('Create Provider')}
      </h2>
      <form className="provider-form" onSubmit={handleSubmit}>
        <div className="provider-preset-picker">
          <label>
            <span className="provider-preset-heading-row">
              <span>{t('Choose your API provider')}</span>
              <span className={`provider-cache-metrics-pill provider-cache-metrics-${selectedPreset.cacheMetricsTone}`}>
                {t(selectedPreset.cacheMetricsLabel)}
              </span>
            </span>
            <select
              value={formState.presetId}
              onChange={(event) => handlePresetChange(event.target.value)}
              disabled={submitLoading}
            >
              {providerPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          {t('Nickname')}
          <input
            value={formState.name}
            onChange={(event) => updateField('name', event.target.value)}
            placeholder={selectedPreset.label}
          />
        </label>

        <label>
          {t('Base URL')}
          <input
            ref={baseUrlInputRef}
            value={formState.baseUrl}
            onChange={(event) => updateField('baseUrl', event.target.value)}
            placeholder={selectedPreset.defaultBaseUrl}
          />
        </label>

        <label>
          {t('API Key')} {editingProvider ? t('(leave empty to keep current)') : ''}
          <input
            type="password"
            value={formState.apiKey}
            onChange={(event) => updateField('apiKey', event.target.value)}
            placeholder={
              editingProvider ? t('Enter new key only when replacing') : 'sk-...'
            }
          />
        </label>

        <label>
          {t('Default Model')}
          <input
            value={formState.defaultModel}
            onChange={(event) => updateField('defaultModel', event.target.value)}
            placeholder={selectedPreset.defaultModel}
          />
        </label>


        <label>
          {t('Notes')}
          <textarea
            rows={3}
            value={formState.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            placeholder={t('Optional notes')}
          />
        </label>

        <details className="schema-advanced provider-advanced">
          <summary>{t('Advanced Settings')}</summary>

          <label>
            {t('Timeout (ms)')}
            <input
              type="number"
              min={1}
              value={formState.timeoutMs}
              onChange={(event) => updateField('timeoutMs', event.target.value)}
            />
          </label>

          <label className="checkbox-label provider-structured-output-toggle">
            <input
              type="checkbox"
              checked={formState.supportsStructuredOutput}
              onChange={(event) => updateField('supportsStructuredOutput', event.target.checked)}
            />
            {t('Supports native structured output')}
            <span
              className={`meta-inline ${
                selectedPreset.id !== 'openrouter' &&
                selectedPreset.id !== 'custom' &&
                selectedPreset.defaultSupportsStructuredOutput
                  ? 'provider-capability-supported'
                  : 'provider-capability-partial'
              }`}
            >
              {selectedPreset.id === 'openrouter' || selectedPreset.id === 'custom'
                ? t(
                    `(${selectedPreset.label}) depends on model`)
                : selectedPreset.defaultSupportsStructuredOutput
                ? t(
                    `(${selectedPreset.label}) supports`)
                : t(
                    `(${selectedPreset.label}) partially supports`)}
            </span>
          </label>

          <label>
            {t('Headers JSON')}
            <textarea
              rows={4}
              value={formState.headersJson}
              onChange={(event) => updateField('headersJson', event.target.value)}
              placeholder='{"x-project":"demo"}'
            />
          </label>
        </details>

        {localError ? <p className="error-line">{localError}</p> : null}
        {formError ? <p className="error-line">{formError}</p> : null}

        <div className="row-actions">
          <button type="submit" disabled={submitLoading}>
            {submitLoading
              ? editingProvider
                ? t('Saving...')
                : t('Creating...')
              : editingProvider
                ? t('Save provider')
                : t('Create provider')}
          </button>

          {editingProvider ? (
            <button
              type="button"
              className="danger"
              onClick={handleCancelEdit}
              disabled={submitLoading}
            >
              {t('Cancel edit')}
            </button>
          ) : onRequestClose ? (
            <button type="button" className="danger" onClick={onRequestClose} disabled={submitLoading}>
              {t('Close')}
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
