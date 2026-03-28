import type { PromptCompileOutput, PromptCompilerSpecInput, PromptRenderInput } from './types/compiler.js';
import { generateConstraintsBlock } from './generators/constraints.js';
import { generateInstructionBlock } from './generators/instruction.js';
import { generateSchemaBlock } from './generators/schema.js';
import { generateToneBlock } from './generators/tone.js';
import { createPromptHash } from './utils/hash.js';
import { toStablePrettyJson } from './utils/format.js';
import { normalizeConstraints } from './utils/normalize.js';

function resolveInputPlaceholder(spec: PromptCompilerSpecInput): '{{INPUT_JSON}}' | '{{INPUT_TEXT}}' {
  if (spec.inputMode === 'json') {
    return '{{INPUT_JSON}}';
  }

  if (spec.inputMode === 'text') {
    return '{{INPUT_TEXT}}';
  }

  if (spec.inputSchema && typeof spec.inputSchema === 'object' && !Array.isArray(spec.inputSchema)) {
    const inputType = (spec.inputSchema as { type?: unknown }).type;
    const isTextType = inputType === 'string' || (Array.isArray(inputType) && inputType.length === 1 && inputType[0] === 'string');
    return isTextType ? '{{INPUT_TEXT}}' : '{{INPUT_JSON}}';
  }

  return '{{INPUT_JSON}}';
}

function joinPromptBlocks(blocks: Array<string | null | undefined>): string {
  return blocks.filter((block): block is string => Boolean(block && block.trim().length > 0)).join('\n\n');
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const line of lines) {
    const normalized = line.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(normalized);
  }

  return unique;
}

export function compilePromptFromSpec(spec: PromptCompilerSpecInput): PromptCompileOutput {
  const inputMode = spec.inputMode === 'text' ? 'text' : 'json';
  const fieldRules = dedupeLines(normalizeConstraints(spec.fieldRules));
  const outputRulesInput = dedupeLines(normalizeConstraints(spec.outputRules));
  const outputRulesFallback = [
    'Return only valid JSON.',
    'Do not add extra fields.',
    'Do not include markdown or explanation text.'
  ];
  const outputRules = (outputRulesInput.length > 0 ? outputRulesInput : outputRulesFallback).filter(
    (line) => !fieldRules.includes(line)
  );

  const taskBlock = `TASK:\n${generateInstructionBlock(spec.instructions)}`;
  const schemaBlock = generateSchemaBlock({
    inputSchema: spec.inputSchema,
    outputSchema: spec.outputSchema,
    inputMode
  });
  const fieldRulesBlock = generateConstraintsBlock('FIELD RULES', fieldRules);
  const outputRulesBlock = generateConstraintsBlock('OUTPUT RULES', outputRules);
  const exampleBlock =
    spec.outputExample === undefined ? '' : `OUTPUT EXAMPLE:\n${toStablePrettyJson(spec.outputExample)}`;
  const toneBlock = generateToneBlock(spec.tone);
  const inputPlaceholder = resolveInputPlaceholder(spec);

  const sections = {
    instructionBlock: taskBlock,
    schemaBlock,
    constraintsBlock: joinPromptBlocks([fieldRulesBlock, outputRulesBlock]),
    examplesBlock: exampleBlock,
    toneBlock,
    fallbackBlock: '',
    validationBlock: ''
  };

  const template = joinPromptBlocks([
    'SYSTEM ROLE:\nYou are an AI assistant that must return JSON matching the OUTPUT FORMAT.',
    taskBlock,
    schemaBlock,
    fieldRulesBlock,
    exampleBlock,
    outputRulesBlock,
    toneBlock,
    `USER INPUT:\n${inputPlaceholder}`,
    'FINAL ANSWER:'
  ]);

  return {
    template,
    hash: createPromptHash(spec.version, template),
    sections
  };
}

export function renderPromptTemplate(template: string, input: PromptRenderInput): string {
  let finalPrompt = template;

  if (finalPrompt.includes('{{INPUT_JSON}}')) {
    if (input.inputJson === undefined) {
      throw new Error('inputJson is required for this prompt template.');
    }

    finalPrompt = finalPrompt.replaceAll('{{INPUT_JSON}}', toStablePrettyJson(input.inputJson));
  }

  if (finalPrompt.includes('{{INPUT_TEXT}}')) {
    if (typeof input.inputText !== 'string') {
      throw new Error('inputText is required for this prompt template.');
    }

    finalPrompt = finalPrompt.replaceAll('{{INPUT_TEXT}}', input.inputText);
  }

  return finalPrompt;
}
