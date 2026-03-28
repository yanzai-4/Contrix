import type {
  CreateProjectRequest,
  ProjectDetailResponse,
  ProjectSummary,
  UpdateProjectRequest
} from '@contrix/spec-core';

export type ProjectRecord = ProjectSummary;

export interface ProjectInsertInput {
  id: string;
  name: string;
  description: string | null;
  baseInstruction: string | null;
  defaultProviderId: string | null;
  apiNamespace: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectUpdateInput {
  id: string;
  name: string;
  description: string | null;
  baseInstruction: string | null;
  defaultProviderId: string | null;
  apiNamespace: string;
  updatedAt: string;
}

export type ProjectCreatePayload = CreateProjectRequest;
export type ProjectUpdatePayload = UpdateProjectRequest;
export type ProjectPublicRecord = ProjectSummary;
export type ProjectDetailPublic = ProjectDetailResponse;
