import type { FastifyCorsOptions } from '@fastify/cors';

const CORS_MODE_ENV_KEY = 'CONTRIX_CORS_MODE';
const CORS_ALLOWLIST_ENV_KEY = 'CONTRIX_CORS_ALLOWLIST';
const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;

type CorsMode = 'local-only' | 'allow-all' | 'allowlist';

function normalizeOrigin(origin: string): string {
  const trimmed = origin.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${protocol}//${hostname}${port}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

function parseAllowlist(rawValue: string | undefined): Set<string> {
  if (!rawValue?.trim()) {
    return new Set<string>();
  }

  const origins = rawValue
    .split(',')
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);

  return new Set(origins);
}

function resolveCorsMode(rawValue: string | undefined): CorsMode {
  const normalized = rawValue?.trim().toLowerCase();
  if (normalized === 'allow-all') {
    return 'allow-all';
  }

  if (normalized === 'allowlist') {
    return 'allowlist';
  }

  return 'local-only';
}

function isOriginAllowed(origin: string, mode: CorsMode, allowlist: Set<string>): boolean {
  if (mode === 'allow-all') {
    return true;
  }

  const normalized = normalizeOrigin(origin);

  if (mode === 'allowlist') {
    return allowlist.has(normalized);
  }

  if (LOCAL_ORIGIN_PATTERN.test(origin.trim())) {
    return true;
  }

  return allowlist.has(normalized);
}

export function buildCorsOptions(): FastifyCorsOptions {
  const mode = resolveCorsMode(process.env[CORS_MODE_ENV_KEY]);
  const allowlist = parseAllowlist(process.env[CORS_ALLOWLIST_ENV_KEY]);

  return {
    origin(origin, callback) {
      // Non-browser clients (e.g. curl / server-to-server) usually send no Origin.
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, isOriginAllowed(origin, mode, allowlist));
    }
  };
}

