import type { PromptCompileResult, PromptSections } from '@contrix/spec-core';

export interface PromptCompilerValidationPolicy {
  strictSchema?: boolean;
  allowCoercion?: boolean;
  deterministicRepair?: boolean;
}

export interface PromptCompilerExample {
  input: unknown;
  output: unknown;
}

export interface PromptCompilerSpecInput {
  id: string;
  version: number;
  instructions: {
    base?: string | null;
    group?: string | null;
    endpoint?: string | null;
    merged?: string | null;
  };
  tone?: string | null;
  inputMode?: 'text' | 'json';
  inputSchema?: unknown;
  outputSchema?: unknown;
  fieldRules?: string[] | string | null;
  outputRules?: string[] | string | null;
  outputExample?: unknown;
  outputExampleKind?: 'semantic' | 'placeholder';
}

export type PromptCompileSections = PromptSections;

export type PromptCompileOutput = PromptCompileResult;

export interface PromptRenderInput {
  inputText?: string;
  inputJson?: unknown;
}
