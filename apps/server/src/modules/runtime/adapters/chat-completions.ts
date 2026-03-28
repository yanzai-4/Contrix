import type {
  AdapterInvokeRequest,
  AdapterInvokeResult,
  RuntimeProviderType
} from '@contrix/runtime-core';
import { RuntimeModuleError } from '../errors.js';
import type { LlmAdapter } from './types.js';
import { normalizeRuntimeTokenUsage } from './usage-normalizer.js';

interface ChatCompletionsChoice {
  finish_reason?: string | null;
  message?: {
    content?: string | Array<{ type?: string; text?: string }> | null;
  };
  text?: string | null;
}

interface ChatCompletionsResponse {
  model?: string;
  choices?: ChatCompletionsChoice[];
  usage?: Record<string, unknown>;
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function extractRawText(response: ChatCompletionsResponse): string {
  const firstChoice = Array.isArray(response.choices) ? response.choices[0] : undefined;

  if (!firstChoice) {
    return '';
  }

  if (typeof firstChoice.message?.content === 'string') {
    return firstChoice.message.content;
  }

  if (Array.isArray(firstChoice.message?.content)) {
    return firstChoice.message.content
      .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
      .join('\n')
      .trim();
  }

  if (typeof firstChoice.text === 'string') {
    return firstChoice.text;
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

async function invokeChatCompletions(
  request: AdapterInvokeRequest,
  providerType: RuntimeProviderType
): Promise<AdapterInvokeResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...request.provider.headers
  };

  const existingAuth = headers.Authorization ?? headers.authorization;
  if (!existingAuth) {
    headers.Authorization = `Bearer ${request.provider.apiKey}`;
  }

  const payload: Record<string, unknown> = {
    model: request.model,
    messages: [
      {
        role: 'user',
        content: request.prompt
      }
    ]
  };

  if (request.temperature !== null && request.temperature !== undefined) {
    payload.temperature = request.temperature;
  }

  if (request.topP !== null && request.topP !== undefined) {
    payload.top_p = request.topP;
  }

  if (request.responseFormat?.mode === 'json_object') {
    payload.response_format = { type: 'json_object' };
  }

  const endpointUrl = joinUrl(request.provider.baseUrl, '/chat/completions');

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

    const json = (await response.json()) as ChatCompletionsResponse;
    const rawText = extractRawText(json);

    return {
      rawText,
      model: typeof json.model === 'string' ? json.model : request.model,
      providerType,
      finishReason:
        Array.isArray(json.choices) && json.choices[0] && typeof json.choices[0].finish_reason === 'string'
          ? json.choices[0].finish_reason
          : null,
      usage: normalizeRuntimeTokenUsage({
        providerType,
        baseUrl: request.provider.baseUrl,
        response: json
      }),
      rawResponse: json,
      providerResponseMeta: {
        requestId: response.headers.get('x-request-id'),
        model: typeof json.model === 'string' ? json.model : request.model,
        providerType,
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

export class OpenAIAdapter implements LlmAdapter {
  async invoke(request: AdapterInvokeRequest): Promise<AdapterInvokeResult> {
    return invokeChatCompletions(request, 'openai');
  }
}

export class OpenAICompatibleAdapter implements LlmAdapter {
  async invoke(request: AdapterInvokeRequest): Promise<AdapterInvokeResult> {
    return invokeChatCompletions(request, request.provider.providerType);
  }
}
