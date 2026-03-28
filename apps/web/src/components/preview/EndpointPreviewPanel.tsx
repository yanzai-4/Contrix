import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EndpointSpecCurrentResponse, EndpointSummary, PromptPreviewResponse } from '@contrix/spec-core';
import type { RuntimePreflightResponse, RuntimeProviderType } from '@contrix/runtime-core';
import { fetchEndpointSpecCurrent, fetchPromptPreview, fetchRuntimePreflightByEndpoint } from '../../services/api';
import { subscribeEndpointContentUpdated } from '../../services/endpointSyncEvents';

export type EndpointPreviewTab = 'prompt' | 'spec' | 'request';

interface EndpointPreviewPanelProps {
  endpoint: EndpointSummary;
  initialTab?: EndpointPreviewTab;
}

type PromptSegmentTone = 'slate' | 'blue' | 'green' | 'orange' | 'purple' | 'gray';

interface PromptSegment {
  id: string;
  hint: string;
  content: string;
  tone: PromptSegmentTone;
}

function buildPromptSegments(preview: PromptPreviewResponse): PromptSegment[] {
  const inputPlaceholder = preview.promptTemplate.includes('{{INPUT_JSON}}') ? '{{INPUT_JSON}}' : '{{INPUT_TEXT}}';

  const segments: PromptSegment[] = [
    {
      id: 'system-role',
      hint: 'Global response behavior.',
      content: 'SYSTEM ROLE:\nYou are an AI assistant that must return JSON matching the OUTPUT FORMAT.',
      tone: 'slate'
    },
    {
      id: 'task',
      hint: 'Task instruction.',
      content: preview.sections.instructionBlock,
      tone: 'blue'
    },
    {
      id: 'schema',
      hint: 'Input and output schema contract.',
      content: preview.sections.schemaBlock,
      tone: 'green'
    },
    {
      id: 'constraints',
      hint: 'Field and output rules.',
      content: preview.sections.constraintsBlock,
      tone: 'orange'
    },
    {
      id: 'examples',
      hint: 'Expected output style example.',
      content: preview.sections.examplesBlock,
      tone: 'purple'
    },
    {
      id: 'tone',
      hint: 'Optional writing style guidance.',
      content: preview.sections.toneBlock,
      tone: 'gray'
    },
    {
      id: 'user-input',
      hint: 'Runtime input placeholder.',
      content: `USER INPUT:\n${inputPlaceholder}`,
      tone: 'slate'
    },
    {
      id: 'final-answer',
      hint: 'Model output start marker.',
      content: 'FINAL ANSWER:',
      tone: 'slate'
    }
  ];

  return segments.filter((segment) => segment.content.trim().length > 0);
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

const DEFAULT_BASE_URL_BY_PROVIDER: Partial<Record<RuntimeProviderType, string>> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  anthropic: 'https://api.anthropic.com/v1'
};

function buildProviderApiRequestPreview(
  endpoint: EndpointSummary,
  runtimePreflight: RuntimePreflightResponse | null
): Record<string, unknown> {
  const renderedPromptPlaceholder = '{Rendered Prompt}';
  const resolvedProviderType = runtimePreflight?.providerType ?? null;
  const resolvedModel = runtimePreflight?.resolvedModel ?? endpoint.model ?? '{resolved_model}';
  const baseUrl = resolvedProviderType
    ? DEFAULT_BASE_URL_BY_PROVIDER[resolvedProviderType] ?? '{provider_base_url}'
    : '{provider_base_url}';
  const adapterBody: Record<string, unknown> = {
    model: resolvedModel,
    messages: [{ role: 'user', content: renderedPromptPlaceholder }]
  };

  if (endpoint.temperature !== null && endpoint.temperature !== undefined) {
    adapterBody.temperature = endpoint.temperature;
  }
  if (endpoint.topP !== null && endpoint.topP !== undefined) {
    adapterBody.top_p = endpoint.topP;
  }
  if (endpoint.enableStructuredOutput) {
    adapterBody.response_format = { type: 'json_object' };
  }

  return {
    url: `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: '****'
    },
    body: adapterBody
  };
}

export function EndpointPreviewPanel({ endpoint, initialTab = 'prompt' }: EndpointPreviewPanelProps) {
  const [activeTab, setActiveTab] = useState<EndpointPreviewTab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [specCurrent, setSpecCurrent] = useState<EndpointSpecCurrentResponse | null>(null);
  const [promptPreview, setPromptPreview] = useState<PromptPreviewResponse | null>(null);
  const [runtimePreflight, setRuntimePreflight] = useState<RuntimePreflightResponse | null>(null);

  const endpointId = endpoint.id;
  const endpointName = endpoint.name;

  const loadPreview = useCallback(
    async (initialLoad = false) => {
      if (initialLoad) {
        setLoading(true);
      } else {
        setSyncing(true);
      }

      setError(null);

      try {
        const [specData, promptPreviewData, runtimePreflightData] = await Promise.all([
          fetchEndpointSpecCurrent(endpointId),
          fetchPromptPreview(endpointId),
          fetchRuntimePreflightByEndpoint(endpointId)
        ]);

        setSpecCurrent(specData);
        setPromptPreview(promptPreviewData);
        setRuntimePreflight(runtimePreflightData);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Failed to load endpoint preview.');
      } finally {
        if (initialLoad) {
          setLoading(false);
        } else {
          setSyncing(false);
        }
      }
    },
    [endpointId]
  );

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, endpointId]);

  useEffect(() => {
    void loadPreview(true);
  }, [loadPreview]);

  useEffect(() => {
    return subscribeEndpointContentUpdated((detail) => {
      if (detail.endpointId !== endpointId) {
        return;
      }

      void loadPreview(false);
    });
  }, [endpointId, loadPreview]);

  const promptSegments = useMemo(() => (promptPreview ? buildPromptSegments(promptPreview) : []), [promptPreview]);
  const apiRequestPreview = useMemo(
    () => buildProviderApiRequestPreview(endpoint, runtimePreflight),
    [endpoint, runtimePreflight]
  );

  return (
    <section className="preview-panel-stack">
      <section className="panel">
        <div className="schema-header-row">
          <div>
            <h3>Preview: {endpointName}</h3>
          </div>

          <div className="row-actions">
            {syncing ? <p className="meta-line">Syncing updates...</p> : null}
          </div>
        </div>

        <div className="preview-tab-row preview-main-tab-row" role="tablist" aria-label="Preview tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'spec'}
            className={`preview-tab-btn ${activeTab === 'spec' ? 'active' : ''}`}
            onClick={() => setActiveTab('spec')}
          >
            Spec
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'prompt'}
            className={`preview-tab-btn ${activeTab === 'prompt' ? 'active' : ''}`}
            onClick={() => setActiveTab('prompt')}
          >
            Prompt
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'request'}
            className={`preview-tab-btn ${activeTab === 'request' ? 'active' : ''}`}
            onClick={() => setActiveTab('request')}
          >
            Request
          </button>
        </div>

        {error ? <p className="error-line">{error}</p> : null}
      </section>

      {loading ? (
        <section className="panel compact-panel">
          <p className="meta-line">Loading preview...</p>
        </section>
      ) : null}

      {!loading && activeTab === 'prompt' ? (
        <section className="panel compact-panel">
          <h3>Final Compiled Prompt</h3>
          {promptPreview ? (
            <>
              <div className="prompt-segment-grid">
                {promptSegments.map((segment) => (
                  <section key={segment.id} className={`prompt-segment prompt-segment-${segment.tone}`}>
                    <span className="prompt-segment-help-wrap">
                      <button type="button" className="prompt-segment-help" aria-label={segment.hint}>
                        ?
                      </button>
                      <span className="prompt-segment-tooltip" role="tooltip">
                        {segment.hint}
                      </span>
                    </span>
                    <pre className="prompt-segment-body">{segment.content}</pre>
                  </section>
                ))}
              </div>

              {promptPreview.warning ? <p className="meta-line">{promptPreview.warning}</p> : null}
            </>
          ) : (
            <p className="meta-line">Prompt preview unavailable.</p>
          )}
        </section>
      ) : null}

      {!loading && activeTab === 'spec' ? (
        <section className="panel compact-panel">
          <h3>Current Effective Spec</h3>
          {specCurrent ? (
            <pre className="json-preview">{prettyJson(specCurrent.currentEffectiveSpec)}</pre>
          ) : (
            <p className="meta-line">Spec preview unavailable.</p>
          )}
        </section>
      ) : null}

      {!loading && activeTab === 'request' ? (
        <section className="panel compact-panel">
          <h3>API Request</h3>
          <pre className="json-preview">{prettyJson(apiRequestPreview)}</pre>
        </section>
      ) : null}
    </section>
  );
}
