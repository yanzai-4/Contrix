import type { ProviderHeaders, ProviderType } from '@contrix/spec-core';

export interface ProviderConnectivityPayload {
  providerId: string;
  type: ProviderType;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  headers: ProviderHeaders;
}

export interface ConnectivityCheckResult {
  success: boolean;
  message: string;
  latencyMs: number;
  providerId: string;
  testedAt: string;
  statusCode?: number;
}

interface EndpointCheck {
  url: string;
  headers: Record<string, string>;
  label: string;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function joinUrl(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}/${path.replace(/^\/+/, '')}`;
}

function buildEndpointChecks(payload: ProviderConnectivityPayload): EndpointCheck[] {
  const sharedHeaders = { ...payload.headers };

  if (payload.type === 'anthropic') {
    return [
      {
        url: joinUrl(payload.baseUrl, 'models'),
        headers: {
          ...sharedHeaders,
          'x-api-key': payload.apiKey,
          'anthropic-version': sharedHeaders['anthropic-version'] ?? '2023-06-01'
        },
        label: 'anthropic models endpoint'
      }
    ];
  }

  const authorization = sharedHeaders.Authorization ?? sharedHeaders.authorization;
  const withBearerHeaders = {
    ...sharedHeaders,
    Authorization: authorization ?? `Bearer ${payload.apiKey}`
  };

  if (payload.type === 'custom') {
    return [
      {
        url: joinUrl(payload.baseUrl, 'models'),
        headers: withBearerHeaders,
        label: 'custom models endpoint'
      },
      {
        url: normalizeBaseUrl(payload.baseUrl),
        headers: withBearerHeaders,
        label: 'custom root endpoint'
      }
    ];
  }

  return [
    {
      url: joinUrl(payload.baseUrl, 'models'),
      headers: withBearerHeaders,
      label: `${payload.type} models endpoint`
    }
  ];
}

async function tryRequest(endpoint: EndpointCheck, timeoutMs: number) {
  const startedAt = Date.now();
  const response = await fetch(endpoint.url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...endpoint.headers
    },
    signal: AbortSignal.timeout(timeoutMs)
  });

  const latencyMs = Date.now() - startedAt;

  return { response, latencyMs };
}

async function extractErrorSnippet(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return null;
    }

    return normalized.slice(0, 180);
  } catch {
    return null;
  }
}

export async function testProviderConnectivity(
  payload: ProviderConnectivityPayload
): Promise<ConnectivityCheckResult> {
  const testedAt = new Date().toISOString();
  const checks = buildEndpointChecks(payload);

  let lastStatusCode: number | undefined;
  let lastMessage = 'Connectivity check failed.';
  let lastLatencyMs = 0;

  for (const check of checks) {
    try {
      const { response, latencyMs } = await tryRequest(check, payload.timeoutMs);
      lastLatencyMs = latencyMs;
      lastStatusCode = response.status;

      if (response.ok) {
        return {
          success: true,
          message: `Connected via ${check.label}.`,
          latencyMs,
          providerId: payload.providerId,
          testedAt,
          statusCode: response.status
        };
      }

      const snippet = await extractErrorSnippet(response);
      lastMessage = snippet
        ? `${check.label} returned ${response.status}: ${snippet}`
        : `${check.label} returned ${response.status}.`;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown network error';
      lastMessage = `${check.label} request failed: ${message}`;
      lastLatencyMs = 0;
    }
  }

  return {
    success: false,
    message: lastMessage,
    latencyMs: lastLatencyMs,
    providerId: payload.providerId,
    testedAt,
    statusCode: lastStatusCode
  };
}
