import type { ProviderType } from '@contrix/spec-core';

export interface ProviderPreset {
  id: string;
  label:
    | 'OpenAI'
    | 'Gemini'
    | 'Claude'
    | 'DeepSeek'
    | 'Qwen'
    | 'Grok'
    | 'Mistral'
    | 'OpenRouter'
    | 'MiniMax'
    | 'Custom';
  icon: string;
  defaultBaseUrl: string;
  defaultProviderType: ProviderType;
  defaultModel: string;
  defaultSupportsStructuredOutput: boolean;
  cacheMetricsLabel:
    | 'Documented cache metrics'
    | 'Cache metrics available (shape varies)'
    | 'Cache metrics not currently documented'
    | 'Cache metrics depend on provider response';
  cacheMetricsTone: 'documented' | 'varies' | 'not_documented' | 'depends';
  isCustom: boolean;
}

export const providerPresets: ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    icon: 'OA',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultProviderType: 'openai',
    defaultModel: 'gpt-4o-mini',
    defaultSupportsStructuredOutput: true,
    cacheMetricsLabel: 'Documented cache metrics',
    cacheMetricsTone: 'documented',
    isCustom: false
  },
  {
    id: 'gemini',
    label: 'Gemini',
    icon: 'GE',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultProviderType: 'custom',
    defaultModel: 'gemini-2.5-flash',
    defaultSupportsStructuredOutput: true,
    cacheMetricsLabel: 'Cache metrics available (shape varies)',
    cacheMetricsTone: 'varies',
    isCustom: false
  },
  {
    id: 'claude',
    label: 'Claude',
    icon: 'CL',
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultProviderType: 'anthropic',
    defaultModel: 'claude-3-7-sonnet-latest',
    defaultSupportsStructuredOutput: true,
    cacheMetricsLabel: 'Documented cache metrics',
    cacheMetricsTone: 'documented',
    isCustom: false
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    icon: 'DS',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultProviderType: 'openai-compatible',
    defaultModel: 'deepseek-chat',
    defaultSupportsStructuredOutput: false,
    cacheMetricsLabel: 'Documented cache metrics',
    cacheMetricsTone: 'documented',
    isCustom: false
  },
  {
    id: 'qwen',
    label: 'Qwen',
    icon: 'QW',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultProviderType: 'openai-compatible',
    defaultModel: 'qwen-plus',
    defaultSupportsStructuredOutput: false,
    cacheMetricsLabel: 'Cache metrics available (shape varies)',
    cacheMetricsTone: 'varies',
    isCustom: false
  },
  {
    id: 'grok',
    label: 'Grok',
    icon: 'GK',
    defaultBaseUrl: 'https://api.x.ai/v1',
    defaultProviderType: 'openai-compatible',
    defaultModel: 'grok-3-mini',
    defaultSupportsStructuredOutput: false,
    cacheMetricsLabel: 'Cache metrics depend on provider response',
    cacheMetricsTone: 'depends',
    isCustom: false
  },
  {
    id: 'mistral',
    label: 'Mistral',
    icon: 'MI',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    defaultProviderType: 'openai-compatible',
    defaultModel: 'mistral-large-latest',
    defaultSupportsStructuredOutput: false,
    cacheMetricsLabel: 'Cache metrics not currently documented',
    cacheMetricsTone: 'not_documented',
    isCustom: false
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    icon: 'OR',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultProviderType: 'openrouter',
    defaultModel: 'openai/gpt-4o-mini',
    defaultSupportsStructuredOutput: false,
    cacheMetricsLabel: 'Documented cache metrics',
    cacheMetricsTone: 'documented',
    isCustom: false
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    icon: 'MM',
    defaultBaseUrl: 'https://api.minimax.io/v1',
    defaultProviderType: 'custom',
    defaultModel: 'minimax-text-01',
    defaultSupportsStructuredOutput: false,
    cacheMetricsLabel: 'Cache metrics available (shape varies)',
    cacheMetricsTone: 'varies',
    isCustom: false
  },
  {
    id: 'custom',
    label: 'Custom',
    icon: 'CU',
    defaultBaseUrl: 'https://',
    defaultProviderType: 'custom',
    defaultModel: 'custom-model',
    defaultSupportsStructuredOutput: false,
    cacheMetricsLabel: 'Cache metrics depend on provider response',
    cacheMetricsTone: 'depends',
    isCustom: true
  }
];

export const customProviderPreset: ProviderPreset =
  providerPresets.find((item) => item.id === 'custom') ?? {
    id: 'custom',
    label: 'Custom',
    icon: 'CU',
    defaultBaseUrl: 'https://',
    defaultProviderType: 'custom',
    defaultModel: 'custom-model',
    defaultSupportsStructuredOutput: false,
    cacheMetricsLabel: 'Cache metrics depend on provider response',
    cacheMetricsTone: 'depends',
    isCustom: true
  };

export function getProviderPresetById(id: string): ProviderPreset {
  return providerPresets.find((item) => item.id === id) ?? customProviderPreset;
}

export function inferProviderPresetId(input: {
  type: ProviderType;
  baseUrl: string | null;
}): string {
  const baseUrl = input.baseUrl?.trim().replace(/\/+$/, '') ?? '';

  const exactMatch = providerPresets.find(
    (preset) => preset.defaultBaseUrl.replace(/\/+$/, '') === baseUrl
  );
  if (exactMatch) {
    return exactMatch.id;
  }

  if (input.type === 'openai') {
    return 'openai';
  }
  if (input.type === 'anthropic') {
    return 'claude';
  }
  if (input.type === 'openrouter') {
    return 'openrouter';
  }

  return 'custom';
}
