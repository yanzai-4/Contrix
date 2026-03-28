import { normalizeText } from '../utils/format.js';

export function generateInstructionBlock(instructions: {
  base?: string | null;
  group?: string | null;
  endpoint?: string | null;
  merged?: string | null;
}): string {
  const merged = normalizeText(instructions.merged);
  if (merged) {
    return merged;
  }

  const parts: Array<{ label: string; content: string | null }> = [
    { label: 'Base', content: normalizeText(instructions.base) },
    { label: 'Group', content: normalizeText(instructions.group) },
    { label: 'Endpoint', content: normalizeText(instructions.endpoint) }
  ];

  const active = parts.filter((item): item is { label: string; content: string } => Boolean(item.content));
  if (active.length === 0) {
    return 'Complete the task using the input and return output that matches the OUTPUT FORMAT.';
  }

  const first = active[0];
  if (active.length === 1 && first) {
    return first.content;
  }

  return active.map((item) => `[${item.label}] ${item.content}`).join('\n');
}
