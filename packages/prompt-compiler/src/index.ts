export const PROMPT_COMPILER_VERSION = 'phase6-prompt-compiler-v1';

export {
  compilePromptFromSpec,
  renderPromptTemplate
} from './compiler.js';

export type {
  PromptCompileOutput,
  PromptCompileSections,
  PromptCompilerExample,
  PromptCompilerSpecInput,
  PromptCompilerValidationPolicy,
  PromptRenderInput
} from './types/compiler.js';
