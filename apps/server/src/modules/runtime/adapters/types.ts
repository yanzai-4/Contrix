import type { AdapterInvokeRequest, AdapterInvokeResult } from '@contrix/runtime-core';

export interface LlmAdapter {
  invoke(request: AdapterInvokeRequest): Promise<AdapterInvokeResult>;
}

