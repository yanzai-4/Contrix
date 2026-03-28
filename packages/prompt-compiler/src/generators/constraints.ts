import { normalizeConstraints } from '../utils/normalize.js';

export function generateConstraintsBlock(
  title: string,
  constraints: string[] | string | null | undefined
): string {
  const normalized = normalizeConstraints(constraints);

  if (normalized.length === 0) {
    return '';
  }

  return `${title}:\n${normalized.map((item) => `- ${item}`).join('\n')}`;
}
