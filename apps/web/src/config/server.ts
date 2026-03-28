const RUNTIME_BASE_URL_STORAGE_KEY = 'contrix.runtime.baseUrl';

function readStoredRuntimeBaseUrl(): string | null {
  try {
    const value = window.localStorage.getItem(RUNTIME_BASE_URL_STORAGE_KEY);
    if (!value) {
      return null;
    }

    const normalized = value.trim().replace(/\/+$/, '');
    return normalized || null;
  } catch {
    return null;
  }
}

export const SERVER_BASE_URL = import.meta.env.VITE_SERVER_URL ?? readStoredRuntimeBaseUrl() ?? 'http://localhost:4411';
