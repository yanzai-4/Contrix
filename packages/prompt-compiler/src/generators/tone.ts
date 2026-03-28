import { normalizeText } from '../utils/format.js';

export function generateToneBlock(tone: string | null | undefined): string {
  const normalized = normalizeText(tone);

  if (!normalized) {
    return '';
  }

  return `STYLE:\nRespond in a ${normalized} tone.`;
}

