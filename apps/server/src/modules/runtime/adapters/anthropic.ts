import type { AdapterInvokeRequest, AdapterInvokeResult } from '@contrix/runtime-core';
import { RuntimeModuleError } from '../errors.js';
import type { LlmAdapter } from './types.js';
import { normalizeRuntimeTokenUsage } from './usage-normalizer.js';

interface AnthropicContentBlock {
  type?: string;
  text?: string;
}

interface AnthropicMessageResponse {
  id?: string;
  model?: string;
  stop_reason?: string | null;
  content?: AnthropicContentBlock[] | null;
}

interface AnthropicControls {
  cacheControlEnabled: boolean;
  cacheControlType: string;
  maxTokens: number;
}

const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 1024;
const ANTHROPIC_CACHE_CONTROL_HEADER = 'x-contrix-anthropic-cache-control';
const ANTHROPIC_CACHE_CONTROL_TYPE_HEADER = 'x-contrix-anthropic-cache-control-type';
const ANTHROPIC_MAX_TOKENS_HEADER = 'x-contrix-anthropic-max-tokens';

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function isTruthyHeaderValue(value: string | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const normalized = (value ?? '').trim();
  if (!normalized) {
    return fallback;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function splitAnthropicHeaders(source: Record<string, string>): {
  outboundHeaders: Record<string, string>;
  controls: AnthropicControls;
} {
  const outboundHeaders: Record<string, string> = {};
  const controls: AnthropicControls = {
    cacheControlEnabled: false,
    cacheControlType: 'ephemeral',
    maxTokens: DEFAULT_MAX_TOKENS
  };

  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = key.trim().toLowerCase();

    if (normalizedKey === ANTHROPIC_CACHE_CONTROL_HEADER) {
      controls.cacheControlEnabled = isTruthyHeaderValue(value);
      continue;
    }

    if (normalizedKey === ANTHROPIC_CACHE_CONTROL_TYPE_HEADER) {
      const normalizedType = value.trim();
      if (normalizedType) {
        controls.cacheControlType = normalizedType;
      }
      continue;
    }

    if (normalizedKey === ANTHROPIC_MAX_TOKENS_HEADER) {
      controls.maxTokens = parsePositiveInteger(value, DEFAULT_MAX_TOKENS);
      continue;
    }

    outboundHeaders[key] = value;
  }

  return { outboundHeaders, controls };
}

function hasHeader(headers: Record<string, string>, expectedName: string): boolean {
  const target = expectedName.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

function extractRawText(response: AnthropicMessageResponse): string {
  if (Array.isArray(response.content)) {
    return response.content
      .map((item) => (item?.type === 'text' && typeof item.text === 'string' ? item.text : ''))
      .filter((value) => value.trim().length > 0)
      .join('\n')
      .trim();
  }

  return '';
}

async function extractErrorSnippet(response: Response): Promise<string> {
  try {
    const raw = await response.text();
    const compact = raw.replace(/\s+/g, ' ').trim();
    if (!compact) {
      return '';
    }

    return compact.slice(0, 280);
  } catch {
    return '';
  }
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const name = error.name.toLowerCase();
  const message = error.message.toLowerCase();

  return (
    name.includes('timeout') ||
    message.includes('timeout') ||
    name.includes('abort') ||
    message.includes('aborted')
  );
}

function isRetryableStatus(statusCode: number): boolean {
  return statusCode === 429 || statusCode >= 500;
}

export class AnthropicAdapter implements LlmAdapter {
  async invoke(request: AdapterInvokeRequest): Promise<AdapterInvokeResult> {
    const { outboundHeaders, controls } = splitAnthropicHeaders(request.provider.headers);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...outboundHeaders
    };

    if (!hasHeader(headers, 'x-api-key')) {
      headers['x-api-key'] = request.provider.apiKey;
    }

    if (!hasHeader(headers, 'anthropic-version')) {
      headers['anthropic-version'] = DEFAULT_ANTHROPIC_VERSION;
    }

    const userContentBlock: Record<string, unknown> = {
      type: 'text',
      text: request.prompt
    };

    if (controls.cacheControlEnabled) {
      userContentBlock.cache_control = {
        type: controls.cacheControlType
      };
    }

    const payload: Record<string, unknown> = {
      model: request.model,
      max_tokens: controls.maxTokens,
      messages: [
        {
          role: 'user',
          content: controls.cacheControlEnabled ? [userContentBlock] : request.prompt
        }
      ]
    };

    if (request.temperature !== null && request.temperature !== undefined) {
      payload.temperature = request.temperature;
    }

    if (request.topP !== null && request.topP !== undefined) {
      payload.top_p = request.topP;
    }

    const endpointUrl = joinUrl(request.provider.baseUrl, '/messages');

    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(request.timeoutMs)
      });

      if (!response.ok) {
        const snippet = await extractErrorSnippet(response);
        const statusCode = response.status;
        const message = snippet
          ? `Provider request failed (${statusCode}): ${snippet}`
          : `Provider request failed (${statusCode}).`;

        throw new RuntimeModuleError('PROVIDER_REQUEST_FAILED', 'provider_request', message, {
          statusCode: statusCode >= 500 ? 502 : statusCode,
          attemptCount: request.attemptIndex,
          retryable: isRetryableStatus(statusCode),
          responseStatus: statusCode
        });
      }

      const json = (await response.json()) as AnthropicMessageResponse;
      const rawText = extractRawText(json);

      return {
        rawText,
        model: typeof json.model === 'string' ? json.model : request.model,
        providerType: 'anthropic',
        finishReason: typeof json.stop_reason === 'string' ? json.stop_reason : null,
        usage: normalizeRuntimeTokenUsage({
          providerType: 'anthropic',
          baseUrl: request.provider.baseUrl,
          response: json
        }),
        rawResponse: json,
        providerResponseMeta: {
          requestId:
            response.headers.get('request-id') ??
            response.headers.get('x-request-id') ??
            response.headers.get('anthropic-request-id'),
          model: typeof json.model === 'string' ? json.model : request.model,
          providerType: 'anthropic',
          statusCode: response.status
        }
      };
    } catch (error) {
      if (error instanceof RuntimeModuleError) {
        throw error;
      }

      if (isTimeoutError(error)) {
        throw new RuntimeModuleError('PROVIDER_TIMEOUT', 'provider_request', 'Provider request timed out.', {
          statusCode: 504,
          attemptCount: request.attemptIndex,
          retryable: true
        });
      }

      const message = error instanceof Error ? error.message : 'Provider request failed.';
      throw new RuntimeModuleError('PROVIDER_REQUEST_FAILED', 'provider_request', message, {
        statusCode: 502,
        attemptCount: request.attemptIndex,
        retryable: true
      });
    }
  }
}
