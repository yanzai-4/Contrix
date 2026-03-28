import type { PromptSections } from '@contrix/spec-core';

export interface PromptSnapshotInsertInput {
  id: string;
  specId: string;
  specVersion: number;
  promptHash: string;
  promptText: string;
  sections: PromptSections;
  createdAt: string;
}

