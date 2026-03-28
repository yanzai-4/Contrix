import type {
  EndpointSpec,
  EndpointSpecVersionRecord,
  EndpointSpecVersionSummary,
  SpecTriggerReason
} from '@contrix/spec-core';

export interface EndpointSpecMetaRecord {
  endpointId: string;
  currentVersion: number;
  currentHash: string | null;
  lastGeneratedAt: string | null;
  updatedAt: string;
  pendingTriggerReason: SpecTriggerReason;
}

export interface EndpointSpecVersionInsertInput {
  id: string;
  endpointId: string;
  version: number;
  spec: EndpointSpec;
  hash: string;
  createdAt: string;
  triggerReason: SpecTriggerReason;
}

export type EndpointSpecVersionRecordInternal = EndpointSpecVersionRecord;

export type EndpointSpecVersionSummaryInternal = EndpointSpecVersionSummary;
