import type { CreateGroupRequest, GroupSummary, UpdateGroupRequest } from '@contrix/spec-core';

export type GroupRecord = GroupSummary;

export interface GroupInsertInput {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  groupInstruction: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupUpdateInput {
  id: string;
  name: string;
  description: string | null;
  groupInstruction: string | null;
  updatedAt: string;
}

export interface GroupListFilters {
  projectId?: string;
}

export type GroupCreatePayload = CreateGroupRequest;
export type GroupUpdatePayload = UpdateGroupRequest;
export type GroupPublicRecord = GroupSummary;
