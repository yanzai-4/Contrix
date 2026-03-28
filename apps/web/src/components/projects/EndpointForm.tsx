import { useEffect, useMemo, useState } from 'react';
import {
  buildRuntimeRoutePreview,
  createEmptyObjectSchemaNode,
  parseEndpointFallbackConfig,
  serializeEndpointFallbackConfig,
  type CreateEndpointRequest,
  type EndpointFallbackMode,
  type SaveEndpointSchemaRequest,
  type SchemaObjectNode,
  type TextInputDescriptor,
  type UpdateEndpointRequest
} from '@contrix/spec-core';
import {
  compileEndpointPrompt,
  fetchEndpointSchema,
  fetchRuntimeSettings,
  regenerateEndpointSpec,
  saveEndpointSchema
} from '../../services/api';
import { emitEndpointContentUpdated } from '../../services/endpointSyncEvents';
import { useProjectStore } from '../../store/useProjectStore';
import { ModalShell } from '../common/ModalShell';
import { SchemaNodeEditor } from '../schema/SchemaNodeEditor';
import { useI18n } from '../../i18n';

interface EndpointFormProps {
  embedded?: boolean;
  onSuccess?: () => void;
  onRequestClose?: () => void;
}

type ContractSchemaMode = 'text' | 'json';
type TimeoutMode = 'inherit' | 'custom';
type FieldHelpTopic =
  | 'description'
  | 'instruction'
  | 'rules'
  | 'tone'
  | 'fallbackMessages'
  | 'temperature'
  | 'topP'
  | 'timeout'
  | 'apiRetry';

interface EndpointFormState {
  name: string;
  pathSlug: string;
  groupId: string;
  providerId: string;
  model: string;
  endpointInstruction: string;
  description: string;
  rules: string;
  examples: string;
  tone: string;
  fallbackMode: EndpointFallbackMode;
  fallbackManualContent: string;
  timeoutMode: TimeoutMode;
  timeoutMs: string;
  enableDeterministicRepair: boolean;
  maxApiRetries: string;
  temperature: string;
  topP: string;
  inputMode: ContractSchemaMode;
  outputMode: ContractSchemaMode;
  inputTextDescription: string;
  outputTextDescription: string;
  outputTextExample: string;
  inputSchemaDraft: SchemaObjectNode;
  outputSchemaDraft: SchemaObjectNode;
}

const initialState: EndpointFormState = {
  name: '',
  pathSlug: '',
  groupId: '',
  providerId: '',
  model: '',
  endpointInstruction: '',
  description: '',
  rules: '',
  examples: '',
  tone: '',
  fallbackMode: 'auto_json',
  fallbackManualContent: '',
  timeoutMode: 'inherit',
  timeoutMs: '',
  enableDeterministicRepair: true,
  maxApiRetries: '3',
  temperature: '0.2',
  topP: '1',
  inputMode: 'json',
  outputMode: 'json',
  inputTextDescription: '',
  outputTextDescription: '',
  outputTextExample: '',
  inputSchemaDraft: createEmptyObjectSchemaNode(),
  outputSchemaDraft: createEmptyObjectSchemaNode()
};

function toFormState(endpoint: {
  name: string;
  pathSlug: string;
  groupId: string | null;
  providerId: string | null;
  model: string | null;
  endpointInstruction: string | null;
  description: string | null;
  rules: string | null;
  examples: string | null;
  tone: string | null;
  fallback: string | null;
  timeoutMs: number | null;
  enableDeterministicRepair: boolean;
  maxApiRetries: number;
  maxRepairRounds: number;
  temperature: number | null;
  topP: number | null;
}): EndpointFormState {
  const fallbackConfig = parseEndpointFallbackConfig(endpoint.fallback);
  const fallbackMode: EndpointFallbackMode = fallbackConfig?.mode ?? 'auto_json';
  const fallbackManualContent = fallbackConfig?.mode === 'manual' ? fallbackConfig.manualContent ?? '' : '';

  return {
    ...initialState,
    name: endpoint.name,
    pathSlug: endpoint.pathSlug,
    groupId: endpoint.groupId ?? '',
    providerId: endpoint.providerId ?? '',
    model: endpoint.model ?? '',
    endpointInstruction: endpoint.endpointInstruction ?? '',
    description: endpoint.description ?? '',
    rules: endpoint.rules ?? '',
    examples: endpoint.examples ?? '',
    tone: endpoint.tone ?? '',
    fallbackMode,
    fallbackManualContent,
    timeoutMode: endpoint.timeoutMs === null ? 'inherit' : 'custom',
    timeoutMs: endpoint.timeoutMs === null ? '' : String(Math.max(1, Math.round(endpoint.timeoutMs / 1000))),
    enableDeterministicRepair: endpoint.enableDeterministicRepair,
    maxApiRetries: String(Math.max(endpoint.maxApiRetries, endpoint.maxRepairRounds)),
    temperature: endpoint.temperature === null ? '' : String(endpoint.temperature),
    topP: endpoint.topP === null ? '' : String(endpoint.topP)
  };
}

function buildTextOutputSchema(description: string, example: string): SchemaObjectNode {
  return {
    type: 'object',
    allowAdditionalProperties: false,
    properties: [
      {
        key: 'text',
        required: true,
        node: {
          type: 'string',
          description: description.trim() || undefined,
          example: example.trim() || undefined
        }
      }
    ]
  };
}

function buildInputSchemaForSave(formState: EndpointFormState): SchemaObjectNode | TextInputDescriptor | null {
  if (formState.inputMode === 'json') {
    return formState.inputSchemaDraft;
  }

  const descriptor: TextInputDescriptor = {
    description: formState.inputTextDescription.trim() || undefined
  };

  if (!descriptor.description) {
    return null;
  }

  return descriptor;
}

function buildOutputSchemaForSave(formState: EndpointFormState): SchemaObjectNode {
  if (formState.outputMode === 'json') {
    return formState.outputSchemaDraft;
  }

  return buildTextOutputSchema(formState.outputTextDescription, formState.outputTextExample);
}

function slugifyEndpointName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildFallbackTextExample(runtimePath: string): string {
  const lines = [
    '[Contrix] [2026-03-24 09:30:00]',
    'Reason: Output validation failed.',
    "Detail: The 'id' field must be a string.",
    `Path  : ${runtimePath}`
  ];

  const [header, ...rest] = lines;
  return [header, ...rest.map((line) => `\t${line}`)].join('\n');
}

function buildFallbackJsonExample(runtimePath: string): string {
  return JSON.stringify(
    {
      isError: true,
      reason: 'Output validation failed.',
      detail: "The 'id' field must be a string.",
      path: runtimePath,
      timestamp: '2026-03-24 09:30:00'
    },
    null,
    2
  );
}

function clampNumberText(
  rawValue: string,
  options: {
    min: number;
    max: number;
    integer?: boolean;
    allowEmpty?: boolean;
  }
): string {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return options.allowEmpty === false ? String(options.min) : '';
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return options.allowEmpty === false ? String(options.min) : '';
  }

  const bounded = Math.max(options.min, Math.min(options.max, parsed));
  const normalized = options.integer ? Math.round(bounded) : bounded;
  return String(normalized);
}

export function EndpointForm({ embedded = false, onSuccess, onRequestClose }: EndpointFormProps) {
  const {
    selectedProjectDetail,
    providerOptions,
    editingEndpointId,
    endpointSubmitting,
    formError,
    createEndpoint,
    updateEndpoint,
    reloadSelectedProject,
    clearFormError,
    cancelEditingEndpoint
  } = useProjectStore();
  const { t } = useI18n();

  const [formState, setFormState] = useState<EndpointFormState>(initialState);
  const [localError, setLocalError] = useState<string | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [postBuildLoading, setPostBuildLoading] = useState(false);
  const [activeHelpTopic, setActiveHelpTopic] = useState<FieldHelpTopic | null>(null);
  const [runtimeRoutePrefix, setRuntimeRoutePrefix] = useState('/runtime');

  const editingEndpoint = useMemo(() => {
    if (!selectedProjectDetail || !editingEndpointId) {
      return null;
    }
    return selectedProjectDetail.endpoints.find((endpoint) => endpoint.id === editingEndpointId) ?? null;
  }, [selectedProjectDetail, editingEndpointId]);

  const defaultProviderId = selectedProjectDetail?.project.defaultProviderId ?? providerOptions[0]?.id ?? '';

  const providerDefaultModelMap = useMemo(() => {
    const next = new Map<string, string>();
    for (const provider of providerOptions) {
      next.set(provider.id, (provider.defaultModel ?? '').trim());
    }
    return next;
  }, [providerOptions]);

  const providerDefaultTimeoutSecondsMap = useMemo(() => {
    const next = new Map<string, number>();
    for (const provider of providerOptions) {
      next.set(provider.id, Math.max(1, Math.round(provider.timeoutMs / 1000)));
    }
    return next;
  }, [providerOptions]);

  useEffect(() => {
    if (!selectedProjectDetail) {
      return;
    }

    if (editingEndpoint) {
      setFormState((state) => ({
        ...toFormState(editingEndpoint),
        providerId: (editingEndpoint.providerId ?? state.providerId) || defaultProviderId
      }));
      return;
    }

    const nextProviderId = defaultProviderId;
    const nextModel = providerDefaultModelMap.get(nextProviderId) ?? '';
    setFormState(() => ({
      ...initialState,
      providerId: nextProviderId,
      model: nextModel
    }));
    setLocalError(null);
  }, [selectedProjectDetail, editingEndpoint, defaultProviderId, providerDefaultModelMap]);

  useEffect(() => {
    if (!editingEndpoint) {
      return;
    }

    let cancelled = false;
    setSchemaLoading(true);

    void (async () => {
      try {
        const { schema } = await fetchEndpointSchema(editingEndpoint.id);
        if (cancelled) {
          return;
        }

        const inputSchema = schema.inputSchema;
        const inputIsJson = inputSchema && typeof inputSchema === 'object' && 'type' in inputSchema;
        const outputSchema = schema.outputSchema;
        const firstOutputProperty = outputSchema.properties[0];
        const outputIsTextMode =
          outputSchema.properties.length === 1 &&
          firstOutputProperty?.key === 'text' &&
          firstOutputProperty.node.type === 'string';

        setFormState((state) => ({
          ...state,
          inputMode: schema.inputMode,
          inputSchemaDraft: inputIsJson ? inputSchema : createEmptyObjectSchemaNode(),
          inputTextDescription: !inputIsJson ? inputSchema?.description ?? '' : '',
          outputMode: outputIsTextMode ? 'text' : 'json',
          outputSchemaDraft: outputSchema,
          outputTextDescription: outputIsTextMode ? firstOutputProperty?.node.description ?? '' : '',
          outputTextExample:
            outputIsTextMode && typeof firstOutputProperty?.node.example === 'string'
              ? firstOutputProperty.node.example
              : ''
        }));
      } catch (error) {
        if (!cancelled) {
          setLocalError(error instanceof Error ? error.message : t('Failed to load endpoint schema.'));
        }
      } finally {
        if (!cancelled) {
          setSchemaLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editingEndpoint, t]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const settings = await fetchRuntimeSettings();
        if (!mounted) {
          return;
        }

        setRuntimeRoutePrefix(settings.effective.routePrefix || '/runtime');
      } catch {
        if (mounted) {
          setRuntimeRoutePrefix('/runtime');
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  if (!selectedProjectDetail) {
    return null;
  }

  const groups = selectedProjectDetail.groups;
  const isEditing = Boolean(editingEndpoint);
  const isBusy = endpointSubmitting || schemaLoading || postBuildLoading;

  const updateField = <K extends keyof EndpointFormState>(key: K, value: EndpointFormState[K]) => {
    setFormState((state) => ({ ...state, [key]: value }));
  };

  const handleNameChange = (value: string) => {
    setFormState((state) => ({
      ...state,
      name: value,
      pathSlug: slugifyEndpointName(value)
    }));
  };

  const handlePathSlugChange = (value: string) => {
    updateField('pathSlug', value);
  };

  const handleProviderChange = (providerId: string) => {
    const nextModel = providerDefaultModelMap.get(providerId) ?? '';
    const nextTimeoutSeconds = providerDefaultTimeoutSecondsMap.get(providerId) ?? 30;
    setFormState((state) => ({
      ...state,
      providerId,
      model: nextModel,
      timeoutMs: state.timeoutMode === 'inherit' ? String(nextTimeoutSeconds) : state.timeoutMs
    }));
  };

  const handleTimeoutModeChange = (mode: TimeoutMode) => {
    setFormState((state) => {
      if (mode === 'inherit') {
        return { ...state, timeoutMode: 'inherit' };
      }

      const fallbackTimeoutSeconds = providerDefaultTimeoutSecondsMap.get(state.providerId) ?? 30;
      return {
        ...state,
        timeoutMode: 'custom',
        timeoutMs: state.timeoutMs.trim() ? state.timeoutMs : String(fallbackTimeoutSeconds)
      };
    });
  };

  const helpContentByTopic: Record<FieldHelpTopic, { title: string; description: string; example: string }> = {
    description: {
      title: t('Description (Optional)'),
      description: t('Human notes only. This field is for documentation and is not sent to AI prompt generation.'),
      example: t('Example: Internal note - used by Support Ops for weekly triage workflow.')
    },
    instruction: {
      title: t('Instruction'),
      description: t(
        'Endpoint-specific behavior instructions merged into the final spec prompt. If JSON output mode is selected, the system will automatically normalize JSON output.'
      ),
      example: t('Example: Prioritize key insights and keep terminology consistent with the project context.')
    },
    rules: {
      title: t('Rules (Optional)'),
      description: t('Explicit constraints that output must follow.'),
      example: t('Example: Output must contain max 5 bullet points and no markdown tables.')
    },
    tone: {
      title: t('Tone (Optional)'),
      description: t('Preferred writing style for generated content when applicable.'),
      example: t('Example: Professional, neutral, and action-oriented.')
    },
    fallbackMessages: {
      title: t('Fallback Messages'),
      description: t(
        'Fallback is the guaranteed backup response when runtime or validation fails, so callers always receive a predictable result.'
      ),
      example: t('Example: Return Auto Json error payload or your fixed Manual fallback content.')
    },
    temperature: {
      title: t('Temperature'),
      description: t('Controls randomness. Lower values are more stable, higher values are more creative.'),
      example: t('Example: 0.2 for stable structured output.')
    },
    topP: {
      title: t('Top P'),
      description: t('Nucleus sampling threshold. Lower values restrict token choices to higher-probability options.'),
      example: t('Example: 1 for full distribution, 0.7 for tighter sampling.')
    },
    timeout: {
      title: t('Timeout (s)'),
      description: t(
        'Use provider default timeout to inherit global value, or turn it off to set endpoint-specific override.'
      ),
      example: t('Example: inherit provider 45s, or set endpoint override to 20s.')
    },
    apiRetry: {
      title: t('API Retry Attempts'),
      description: t('Maximum additional provider retries after the first call fails.'),
      example: t('Example: 1 means up to 2 total provider attempts.')
    }
  };

  const routePreview = buildRuntimeRoutePreview(
    selectedProjectDetail.project.apiNamespace,
    formState.pathSlug || '{path-slug}',
    runtimeRoutePrefix
  );
  const selectedProvider = providerOptions.find((provider) => provider.id === formState.providerId) ?? null;
  const selectedProviderTimeoutSeconds = selectedProvider
    ? Math.max(1, Math.round(selectedProvider.timeoutMs / 1000))
    : 30;
  const timeoutInputValue =
    formState.timeoutMode === 'inherit' ? String(selectedProviderTimeoutSeconds) : formState.timeoutMs;
  const outputStrategyMode: 'native' | 'json-instruction' | null =
    formState.outputMode !== 'json'
      ? null
      : selectedProvider?.supportsStructuredOutput === true
        ? 'native'
        : 'json-instruction';
  const fallbackTextExample = buildFallbackTextExample(routePreview);
  const fallbackJsonExample = buildFallbackJsonExample(routePreview);

  const handleCancel = () => {
    cancelEditingEndpoint();
    onRequestClose?.();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFormError();
    setLocalError(null);

    const name = formState.name.trim();
    const pathSlug = formState.pathSlug.trim();
    const providerId = formState.providerId.trim();

    if (!name) {
      setLocalError(t('Endpoint name is required.'));
      return;
    }
    if (!pathSlug) {
      setLocalError(t('Path slug is required.'));
      return;
    }
    if (!providerId) {
      setLocalError(t('Provider is required.'));
      return;
    }

    const model = formState.model.trim();
    if (!model) {
      setLocalError(t('Model is required.'));
      return;
    }

    let timeoutMs: number | null = null;
    if (formState.timeoutMode === 'custom') {
      if (!formState.timeoutMs.trim()) {
        setLocalError(t('Custom timeout is required.'));
        return;
      }

      const timeoutSeconds = Number(formState.timeoutMs);
      if (!Number.isFinite(timeoutSeconds) || !Number.isInteger(timeoutSeconds) || timeoutSeconds <= 0 || timeoutSeconds > 120) {
        setLocalError(t('Timeout must be an integer between 1 and 120 seconds.'));
        return;
      }

      timeoutMs = timeoutSeconds * 1000;
    }

    const maxApiRetries = Number(formState.maxApiRetries);
    if (!Number.isInteger(maxApiRetries) || maxApiRetries < 0 || maxApiRetries > 10) {
      setLocalError(t('API Retry Attempts must be an integer between 0 and 10.'));
      return;
    }

    const temperature = formState.temperature.trim() ? Number(formState.temperature) : null;
    if (temperature !== null && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) {
      setLocalError(t('Temperature must be between 0 and 2.'));
      return;
    }

    const topP = formState.topP.trim() ? Number(formState.topP) : null;
    if (topP !== null && (!Number.isFinite(topP) || topP <= 0 || topP > 1)) {
      setLocalError(t('Top P must be greater than 0 and less than or equal to 1.'));
      return;
    }

    if (formState.inputMode === 'json' && formState.inputSchemaDraft.properties.length === 0) {
      setLocalError(
        t(
          'Input schema in structured mode should include at least one field.')
      );
      return;
    }

    if (formState.outputMode === 'json' && formState.outputSchemaDraft.properties.length === 0) {
      setLocalError(
        t(
          'Output schema in structured mode should include at least one field.')
      );
      return;
    }

    if (formState.fallbackMode === 'manual' && !formState.fallbackManualContent.trim()) {
      setLocalError(t('Manual fallback content is required when Fallback Type is Manual.'));
      return;
    }

    const serializedFallback = serializeEndpointFallbackConfig({
      enabled: true,
      mode: formState.fallbackMode,
      manualContent: formState.fallbackMode === 'manual' ? formState.fallbackManualContent : undefined
    });

    const payloadBase = {
      providerId,
      name,
      pathSlug,
      groupId: formState.groupId || undefined,
      model,
      endpointInstruction: formState.endpointInstruction.trim() || undefined,
      description: formState.description.trim() || undefined,
      rules: formState.rules.trim() || undefined,
      examples: formState.examples.trim() || undefined,
      tone: formState.tone.trim() || undefined,
      fallback: serializedFallback ?? undefined,
      timeoutMs,
      enableDeterministicRepair: formState.enableDeterministicRepair,
      maxApiRetries,
      maxRepairRounds: maxApiRetries,
      temperature,
      topP
    };

    let endpointSaved = false;
    let endpointIdForPipeline: string | null = editingEndpoint?.id ?? null;

    if (editingEndpoint) {
      const payload: UpdateEndpointRequest = payloadBase;
      endpointSaved = await updateEndpoint(editingEndpoint.id, payload);
    } else {
      const payload: Omit<CreateEndpointRequest, 'projectId'> = payloadBase;
      endpointSaved = await createEndpoint(payload);
    }

    if (!endpointSaved) {
      return;
    }

    if (!endpointIdForPipeline) {
      const latestDetail = useProjectStore.getState().selectedProjectDetail;
      endpointIdForPipeline =
        latestDetail?.endpoints.find((endpoint) => endpoint.pathSlug === pathSlug && endpoint.name === name)?.id ??
        latestDetail?.endpoints.find((endpoint) => endpoint.pathSlug === pathSlug)?.id ??
        null;
    }

    if (!endpointIdForPipeline) {
      setLocalError(
        t(
          'Endpoint was saved, but follow-up generation could not resolve endpoint id.')
      );
      return;
    }

    setPostBuildLoading(true);
    try {
      const schemaPayload: SaveEndpointSchemaRequest = {
        inputMode: formState.inputMode,
        inputSchema: buildInputSchemaForSave(formState),
        outputSchema: buildOutputSchemaForSave(formState)
      };

      await saveEndpointSchema(endpointIdForPipeline, schemaPayload);
      await regenerateEndpointSpec(endpointIdForPipeline);
      await compileEndpointPrompt(endpointIdForPipeline);
      await reloadSelectedProject();

      setFormState(() => ({
        ...initialState,
        providerId: defaultProviderId,
        model: providerDefaultModelMap.get(defaultProviderId) ?? ''
      }));
      setLocalError(null);
      onSuccess?.();
    } catch (error) {
      setLocalError(
        error instanceof Error
          ? error.message
          : t('Failed to auto-generate spec/prompt after endpoint save.')
      );
    } finally {
      emitEndpointContentUpdated({ endpointId: endpointIdForPipeline, source: 'edit' });
      setPostBuildLoading(false);
    }
  };

  const content = (
    <>
      <div className="panel-header-row">
        <h3>
          {isEditing
            ? t(`Edit Endpoint: ${editingEndpoint?.name ?? ''}`)
            : t('Create Endpoint')}
        </h3>
      </div>

      <form className="project-form" onSubmit={handleSubmit}>
        <section className="schema-field-card">
          <h4>{t('Basic Endpoint Info')}</h4>
          <div className="schema-grid two-col">
            <label>
              {t('Endpoint Name')}
              <input value={formState.name} onChange={(event) => handleNameChange(event.target.value)} />
            </label>
            <label>
              {t('Path / Slug')}
              <input value={formState.pathSlug} onChange={(event) => handlePathSlugChange(event.target.value)} />
            </label>
            <label>
              {t('Project')}
              <input value={selectedProjectDetail.project.name} disabled />
            </label>
            <label>
              {t('Group')}
              <select value={formState.groupId} onChange={(event) => updateField('groupId', event.target.value)}>
                <option value="">{t('None')}</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('Provider')}
              <select value={formState.providerId} onChange={(event) => handleProviderChange(event.target.value)}>
                <option value="">{t('Select provider')}</option>
                {providerOptions.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} ({provider.type})
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('Model')}
              <input value={formState.model} onChange={(event) => updateField('model', event.target.value)} required />
            </label>
          </div>

          <p className="meta-line">
            {t('Route preview')}: <code>{routePreview}</code>
          </p>

          <label>
            <span className="label-with-help">
              {t('Description (Optional)')}
              <button type="button" className="field-help-btn" onClick={() => setActiveHelpTopic('description')}>
                ?
              </button>
            </span>
            <textarea
              className="endpoint-form-textarea"
              rows={2}
              placeholder={t('Add endpoint notes here... (Not used by AI)')}
              value={formState.description}
              onChange={(event) => updateField('description', event.target.value)}
            />
          </label>

          <label>
            <span className="label-with-help">
              {t('Instruction')}
              <button type="button" className="field-help-btn" onClick={() => setActiveHelpTopic('instruction')}>
                ?
              </button>
            </span>
            <textarea
              className="endpoint-form-textarea"
              rows={3}
              placeholder={t('Describe endpoint instruction here... (If JSON output mode is selected, JSON output will be auto-normalized)')}
              value={formState.endpointInstruction}
              onChange={(event) => updateField('endpointInstruction', event.target.value)}
            />
          </label>

          <details className="schema-advanced">
            <summary>{t('Additional Instruction')}</summary>
            <div className="schema-grid two-col">
              <label>
                <span className="label-with-help">
                  {t('Rules (Optional)')}
                  <button type="button" className="field-help-btn" onClick={() => setActiveHelpTopic('rules')}>
                    ?
                  </button>
                </span>
                <textarea
                  className="endpoint-form-textarea"
                  rows={3}
                  placeholder={t('Add rules here...')}
                  value={formState.rules}
                  onChange={(event) => updateField('rules', event.target.value)}
                />
              </label>
              <label>
                <span className="label-with-help">
                  {t('Tone (Optional)')}
                  <button type="button" className="field-help-btn" onClick={() => setActiveHelpTopic('tone')}>
                    ?
                  </button>
                </span>
                <textarea
                  className="endpoint-form-textarea"
                  rows={3}
                  placeholder={t('Describe tone here...')}
                  value={formState.tone}
                  onChange={(event) => updateField('tone', event.target.value)}
                />
              </label>
            </div>
          </details>
        </section>

        <section className="schema-field-card">
          <details className="schema-advanced">
            <summary>{t('Sampling Controls')}</summary>
            <div className="schema-grid two-col">
              <label>
                <span className="label-with-help">
                  {t('Temperature (Range: 0-2)')}
                  <button type="button" className="field-help-btn" onClick={() => setActiveHelpTopic('temperature')}>
                    ?
                  </button>
                </span>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={formState.temperature}
                  onChange={(event) =>
                    updateField(
                      'temperature',
                      clampNumberText(event.target.value, {
                        min: 0,
                        max: 2,
                        allowEmpty: true
                      })
                    )
                  }
                />
              </label>
              <label>
                <span className="label-with-help">
                  {t('Top P (Range: 0.01-1)')}
                  <button type="button" className="field-help-btn" onClick={() => setActiveHelpTopic('topP')}>
                    ?
                  </button>
                </span>
                <input
                  type="number"
                  min={0.01}
                  max={1}
                  step={0.01}
                  value={formState.topP}
                  onChange={(event) =>
                    updateField(
                      'topP',
                      clampNumberText(event.target.value, {
                        min: 0.01,
                        max: 1,
                        allowEmpty: true
                      })
                    )
                  }
                />
              </label>
            </div>
          </details>
        </section>

        <section className="schema-field-card">
          <h4>{t('Input / Output Contract')}</h4>
          <div className="schema-grid">
            <section className="schema-field-card">
              <div className="panel-header-row">
                <h4>{t('Input')}</h4>
                <div>
                  <select
                    value={formState.inputMode}
                    onChange={(event) => updateField('inputMode', event.target.value as ContractSchemaMode)}
                    aria-label={t('Input mode')}
                  >
                    <option value="json">{t('Json mode')}</option>
                    <option value="text">{t('Text mode')}</option>
                  </select>
                </div>
              </div>

              {formState.inputMode === 'text' ? (
                <label>
                  {t('Input description')}
                  <textarea
                    className="endpoint-form-textarea"
                    rows={2}
                    value={formState.inputTextDescription}
                    onChange={(event) => updateField('inputTextDescription', event.target.value)}
                  />
                </label>
              ) : (
                <SchemaNodeEditor
                  node={formState.inputSchemaDraft}
                  onChange={(nextNode) => {
                    if (nextNode.type === 'object') {
                      updateField('inputSchemaDraft', nextNode);
                    }
                  }}
                  disableTypeChange
                  progressive
                  bareRoot
                  hideFieldConstraintsAndExample
                  hideNullableAndDefault
                  defaultFieldRequired
                />
              )}
            </section>

            <section className="schema-field-card">
              <div className="panel-header-row">
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <h4 style={{ margin: 0 }}>{t('Output')}</h4>
                  {outputStrategyMode ? (
                    <span className={`provider-badge ${outputStrategyMode === 'native' ? 'provider-badge-blue' : 'provider-badge-yellow'}`}>
                      {outputStrategyMode === 'native'
                        ? t('Provider-enforced JSON')
                        : t('Prompt-guided JSON')}
                    </span>
                  ) : null}
                </div>
                <div>
                  <select
                    value={formState.outputMode}
                    onChange={(event) => updateField('outputMode', event.target.value as ContractSchemaMode)}
                    aria-label={t('Output mode')}
                  >
                    <option value="json">{t('Json mode')}</option>
                    <option value="text">{t('Text mode')}</option>
                  </select>
                </div>
              </div>

              {formState.outputMode === 'text' ? (
                <>
                  <p className="meta-line">
                    {t(
                      'Text mode stores a simple output contract and hides the graphical JSON field editor.')}
                  </p>
                  <label>
                    {t('Output description')}
                    <textarea
                      className="endpoint-form-textarea"
                      rows={2}
                      value={formState.outputTextDescription}
                      onChange={(event) => updateField('outputTextDescription', event.target.value)}
                    />
                  </label>
                  <details className="schema-advanced">
                    <summary>{t('Additional Instruction')}</summary>
                    <label>
                      {t('Output Constraint')}
                      <textarea
                        className="endpoint-form-textarea"
                        rows={2}
                        value={formState.rules}
                        onChange={(event) => updateField('rules', event.target.value)}
                      />
                    </label>
                    <label>
                      {t('Example output text')}
                      <textarea
                        className="endpoint-form-textarea"
                        rows={2}
                        value={formState.outputTextExample}
                        onChange={(event) => updateField('outputTextExample', event.target.value)}
                      />
                    </label>
                  </details>
                </>
              ) : (
                <SchemaNodeEditor
                  node={formState.outputSchemaDraft}
                  onChange={(nextNode) => {
                    if (nextNode.type === 'object') {
                      updateField('outputSchemaDraft', nextNode);
                    }
                  }}
                  disableTypeChange
                  progressive
                  bareRoot
                  hideObjectAdditionalProperties
                  hideNullableAndDefault
                  defaultFieldRequired
                />
              )}
            </section>

          </div>
        </section>

        <section className="schema-field-card">
          <details className="schema-advanced">
            <summary>
              <span className="label-with-help">
                {t('Fallback Messages')}
                <button
                  type="button"
                  className="field-help-btn"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setActiveHelpTopic('fallbackMessages');
                  }}
                >
                  ?
                </button>
              </span>
            </summary>
            <div className="schema-grid">
              <label>
                {t('Fallback Type')}
                <select
                  value={formState.fallbackMode}
                  onChange={(event) => updateField('fallbackMode', event.target.value as EndpointFallbackMode)}
                >
                  <option value="auto_json">{t('Auto Json')}</option>
                  <option value="auto_text">{t('Auto Text')}</option>
                  <option value="manual">{t('Manual')}</option>
                </select>
              </label>

              {formState.fallbackMode === 'manual' ? (
                <section>
                  <label>
                    {t('Manual Fallback Content')}
                    <textarea
                      className="endpoint-form-textarea"
                      rows={5}
                      value={formState.fallbackManualContent}
                      onChange={(event) => updateField('fallbackManualContent', event.target.value)}
                      placeholder={t('Enter fixed fallback JSON or text. Runtime will return this content when fallback is triggered.')}
                    />
                  </label>
                  <p className="meta-line">
                    {t('You can provide JSON or plain text to force a fixed fallback response.')}
                  </p>
                </section>
              ) : formState.fallbackMode === 'auto_text' ? (
                <section>
                  <p className="meta-line">{t('Fallback Text')}</p>
                  <pre className="json-preview">{fallbackTextExample}</pre>
                </section>
              ) : (
                <section>
                  <p className="meta-line">{t('Fallback JSON')}</p>
                  <pre className="json-preview">{fallbackJsonExample}</pre>
                </section>
              )}
            </div>
          </details>
        </section>

        <section className="schema-field-card">
          <details className="schema-advanced">
            <summary>{t('Repair Options')}</summary>
            <div className="schema-grid two-col">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formState.timeoutMode === 'inherit'}
                  onChange={(event) => handleTimeoutModeChange(event.target.checked ? 'inherit' : 'custom')}
                />
                {t('Use provider default timeout')}
              </label>
              <label>
                <span className="label-with-help">
                  {t('Timeout (s) (Range: 1-120)')}
                  <button type="button" className="field-help-btn" onClick={() => setActiveHelpTopic('timeout')}>
                    ?
                  </button>
                </span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={timeoutInputValue}
                  disabled={formState.timeoutMode === 'inherit'}
                  onChange={(event) =>
                    updateField(
                      'timeoutMs',
                      clampNumberText(event.target.value, {
                        min: 1,
                        max: 120,
                        integer: true,
                        allowEmpty: true
                      })
                    )
                  }
                />
                <p className="meta-line">
                  {formState.timeoutMode === 'inherit'
                    ? `${t('Inherited from provider')}: ${selectedProviderTimeoutSeconds}s`
                    : t('Using endpoint-specific timeout override.')}
                </p>
              </label>
              <label>
                <span className="label-with-help">
                  {t('API Retry Attempts (Range: 0-10)')}
                  <button type="button" className="field-help-btn" onClick={() => setActiveHelpTopic('apiRetry')}>
                    ?
                  </button>
                </span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={1}
                  value={formState.maxApiRetries}
                  onChange={(event) =>
                    updateField(
                      'maxApiRetries',
                      clampNumberText(event.target.value, {
                        min: 0,
                        max: 10,
                        integer: true,
                        allowEmpty: false
                      })
                    )
                  }
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formState.enableDeterministicRepair}
                  onChange={(event) => updateField('enableDeterministicRepair', event.target.checked)}
                />
                {t('Enable deterministic repair')}
              </label>
              {formState.outputMode === 'json' ? (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={Boolean(formState.outputSchemaDraft.allowAdditionalProperties)}
                    onChange={(event) =>
                      updateField('outputSchemaDraft', {
                        ...formState.outputSchemaDraft,
                        allowAdditionalProperties: event.target.checked
                      })
                    }
                  />
                  {t('Allow additional properties')}
                </label>
              ) : null}
            </div>
          </details>
        </section>

        {schemaLoading ? <p className="meta-line">{t('Loading existing schema...')}</p> : null}
        {localError ? <p className="error-line">{localError}</p> : null}
        {formError ? <p className="error-line">{formError}</p> : null}

        <div className="row-actions">
          <button type="submit" disabled={isBusy}>
            {isBusy ? t('Saving and building...') : isEditing ? t('Save Endpoint') : t('Create Endpoint')}
          </button>
          <button type="button" className="danger" onClick={handleCancel} disabled={isBusy}>
            {t('Cancel')}
          </button>
        </div>
        <p className="meta-line">
          {t('Save applies your changes and refreshes Preview and Test automatically.')}
        </p>
      </form>
    </>
  );

  const activeHelp = activeHelpTopic ? helpContentByTopic[activeHelpTopic] : null;

  if (embedded) {
    return (
      <>
        <section className="panel compact-panel">{content}</section>
        {activeHelp ? (
          <ModalShell onClose={() => setActiveHelpTopic(null)} size="default">
            <section className="panel compact-panel">
              <h3>{activeHelp.title}</h3>
              <p className="meta-line">{activeHelp.description}</p>
              <p className="meta-line">{activeHelp.example}</p>
            </section>
          </ModalShell>
        ) : null}
      </>
    );
  }

  return (
    <>
      <section className="panel compact-panel">{content}</section>
      {activeHelp ? (
        <ModalShell onClose={() => setActiveHelpTopic(null)} size="default">
          <section className="panel compact-panel">
            <h3>{activeHelp.title}</h3>
            <p className="meta-line">{activeHelp.description}</p>
            <p className="meta-line">{activeHelp.example}</p>
          </section>
        </ModalShell>
      ) : null}
    </>
  );
}

