const SILENT_MODE_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export function isSilentModeEnabled(value: string | undefined = process.env.CONTRIX_SILENT_MODE): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return SILENT_MODE_TRUE_VALUES.has(normalized);
}
