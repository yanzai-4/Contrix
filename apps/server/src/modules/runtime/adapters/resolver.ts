import type { RuntimeProviderType } from '@contrix/runtime-core';
import { RuntimeModuleError } from '../errors.js';
import { AnthropicAdapter } from './anthropic.js';
import { OpenAIAdapter, OpenAICompatibleAdapter } from './chat-completions.js';
import type { LlmAdapter } from './types.js';

const openAiAdapter = new OpenAIAdapter();
const openAiCompatibleAdapter = new OpenAICompatibleAdapter();
const anthropicAdapter = new AnthropicAdapter();

export function resolveAdapter(providerType: RuntimeProviderType): LlmAdapter {
  if (providerType === 'openai') {
    return openAiAdapter;
  }

  if (
    providerType === 'openai-compatible' ||
    providerType === 'openrouter' ||
    providerType === 'custom'
  ) {
    return openAiCompatibleAdapter;
  }

  if (providerType === 'anthropic') {
    return anthropicAdapter;
  }

  throw new RuntimeModuleError(
    'ADAPTER_NOT_IMPLEMENTED',
    'provider_request',
    `No runtime adapter is available for provider type "${providerType}".`,
    {
      statusCode: 501
    }
  );
}
