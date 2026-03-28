import type {
  RuntimeInputMode,
  RuntimeMetaResponse,
  RuntimePreflightResponse,
  RuntimeRequest
} from '@contrix/runtime-core';

type RuntimeRequestInputMode =
  | RuntimeInputMode
  | RuntimeMetaResponse['inputMode']
  | RuntimePreflightResponse['inputMode']
  | null;

export function buildRuntimeRequestPayload(
  inputMode: RuntimeRequestInputMode,
  inputText: string,
  inputJsonText: string,
  overrideModel: string | null | undefined
): RuntimeRequest {
  const payload: RuntimeRequest = {};

  const normalizedOverride = (overrideModel ?? '').trim();
  if (normalizedOverride) {
    payload.overrideModel = normalizedOverride;
  }

  if (inputMode === 'text') {
    payload.inputText = inputText;
    return payload;
  }

  if (inputMode === 'json') {
    const rawJson = inputJsonText.trim();
    if (!rawJson) {
      throw new Error('Input JSON is required.');
    }

    try {
      payload.inputJson = JSON.parse(rawJson);
    } catch {
      throw new Error('Input JSON is invalid.');
    }

    return payload;
  }

  throw new Error('Input mode is unavailable. Run readiness check first.');
}
