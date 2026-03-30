import { randomUUID } from 'node:crypto';
import type {
  EndpointSpec,
  EndpointSpecContent,
  EndpointSpecCurrentResponse,
  EndpointSpecDiffResponse,
  EndpointSpecExportResponse,
  EndpointSpecRegenerateResponse,
  EndpointSpecSourceSnapshot,
  EndpointSpecVersionItemResponse,
  EndpointSpecVersionsResponse,
  EndpointSummary,
  SpecStatus,
  SpecTriggerReason
} from '@contrix/spec-core';
import {
  buildDefaultRepairPolicy,
  buildDefaultStrictnessPolicy,
  buildDefaultStructuredOutputStrategy,
  buildDefaultValidationPolicy,
  createEndpointSpecHash,
  diffEndpointSpecs,
  toEndpointEffectiveSpec,
  toEndpointSpecBuildMetadata,
  toEndpointSpecLayered,
  type InputMode,
  type ProviderType
} from '@contrix/spec-core';
import type { SQLiteDatabase } from '../../db/types.js';
import { ModuleError } from '../common/errors.js';
import { EndpointRepository } from '../endpoint/repository.js';
import {
  normalizeInputMode,
  parseStoredInputSchema,
  parseStoredOutputSchema
} from '../endpoint/schema-utils.js';
import { GroupRepository } from '../group/repository.js';
import { ProjectRepository } from '../project/repository.js';
import { ProviderRegistry } from '../provider/registry.js';
import { RuntimeStateRepository } from '../runtime/state-repository.js';
import { SpecRepository } from './repository.js';

interface SpecGenerationResult {
  spec: EndpointSpec;
  createdNewVersion: boolean;
  generatedAt: string;
}

interface SourceCollectionResult {
  endpoint: EndpointSummary;
  inputMode: InputMode;
  inputSchema: EndpointSpecContent['input']['schema'];
  outputSchema: EndpointSpecContent['output']['schema'];
  sourceSnapshot: EndpointSpecSourceSnapshot;
  providerSupportsStructuredOutput: boolean;
  resolvedModel: string | null;
}

function isTextModeOutputSchema(
  schema: EndpointSpecContent['output']['schema']
): boolean {
  if (schema.type !== 'object') {
    return false;
  }

  if (schema.properties.length !== 1) {
    return false;
  }

  const field = schema.properties[0];
  if (!field) {
    return false;
  }

  return field.key === 'text' && field.node.type === 'string';
}

const AUTO_JSON_OUTPUT_INSTRUCTION =
  'Return only valid JSON that strictly matches the OUTPUT FORMAT schema. Do not add markdown, explanations, or extra fields.';

function buildEndpointInstructionWithAutoJsonGuard(
  endpointInstruction: string | null,
  shouldInjectAutoJsonGuard: boolean
): string | null {
  const normalizedInstruction = endpointInstruction?.trim() ?? '';

  if (!shouldInjectAutoJsonGuard) {
    return normalizedInstruction || null;
  }

  if (!normalizedInstruction) {
    return AUTO_JSON_OUTPUT_INSTRUCTION;
  }

  const normalizedLower = normalizedInstruction.toLowerCase();
  if (
    normalizedLower.includes('valid json') &&
    (normalizedLower.includes('output format') || normalizedLower.includes('schema'))
  ) {
    return normalizedInstruction;
  }

  return `${normalizedInstruction}\n\n${AUTO_JSON_OUTPUT_INSTRUCTION}`;
}

function normalizeSpecStatus(status: SpecStatus | null | undefined): SpecStatus {
  if (status === 'missing' || status === 'current' || status === 'stale') {
    return status;
  }

  return 'missing';
}

export class SpecService {
  private readonly endpointRepository: EndpointRepository;
  private readonly projectRepository: ProjectRepository;
  private readonly groupRepository: GroupRepository;
  private readonly providerRegistry: ProviderRegistry;
  private readonly specRepository: SpecRepository;
  private readonly runtimeStateRepository: RuntimeStateRepository;

  constructor(db: SQLiteDatabase) {
    this.endpointRepository = new EndpointRepository(db);
    this.projectRepository = new ProjectRepository(db);
    this.groupRepository = new GroupRepository(db);
    this.providerRegistry = new ProviderRegistry(db);
    this.specRepository = new SpecRepository(db);
    this.runtimeStateRepository = new RuntimeStateRepository(db);
  }

  getCurrentSpec(endpointId: string): EndpointSpecCurrentResponse {
    const endpoint = this.requireEndpoint(endpointId);
    this.specRepository.ensureMeta(endpointId, endpoint.specStatus === 'missing' ? 'initial' : 'system_rebuild');

    let currentVersion = this.specRepository.getCurrentVersion(endpointId);
    let meta = this.specRepository.getMeta(endpointId);
    const endpointStatus = normalizeSpecStatus(endpoint.specStatus);
    const isStale = endpointStatus !== 'current' || !currentVersion;

    if (isStale) {
      const triggerReason = this.resolveTriggerReason(endpointStatus, meta?.pendingTriggerReason, Boolean(currentVersion));
      const generation = this.generateSpec(endpointId, triggerReason);
      currentVersion = {
        id: generation.spec.id,
        endpointId,
        version: generation.spec.version,
        hash: generation.spec.hash,
        createdAt: generation.spec.generatedAt,
        triggerReason,
        isCurrent: true,
        spec: generation.spec
      };
      meta = this.specRepository.getMeta(endpointId);
    }

    if (!currentVersion) {
      throw new ModuleError('SPEC_NOT_FOUND', 500, 'Failed to resolve current spec version.');
    }

    return {
      endpointId,
      currentSpec: currentVersion.spec,
      currentEffectiveSpec: toEndpointEffectiveSpec(currentVersion.spec),
      currentSpecMetadata: toEndpointSpecBuildMetadata(currentVersion.spec, {
        triggerReason: currentVersion.triggerReason,
        includeInternal: true
      }),
      currentSpecLayered: toEndpointSpecLayered(currentVersion.spec, {
        triggerReason: currentVersion.triggerReason,
        includeSourceSnapshot: false,
        includeInternalMetadata: true
      }),
      isStale: false,
      currentVersion: currentVersion.version,
      lastGeneratedAt: meta?.lastGeneratedAt ?? currentVersion.createdAt
    };
  }

  regenerateSpec(endpointId: string): EndpointSpecRegenerateResponse {
    this.requireEndpoint(endpointId);

    const generation = this.generateSpec(endpointId, 'manual_regenerate');
    const meta = this.specRepository.getMeta(endpointId);

    return {
      endpointId,
      currentSpec: generation.spec,
      currentEffectiveSpec: toEndpointEffectiveSpec(generation.spec),
      currentSpecMetadata: toEndpointSpecBuildMetadata(generation.spec, {
        triggerReason: 'manual_regenerate',
        includeInternal: true
      }),
      currentSpecLayered: toEndpointSpecLayered(generation.spec, {
        triggerReason: 'manual_regenerate',
        includeSourceSnapshot: false,
        includeInternalMetadata: true
      }),
      isStale: false,
      currentVersion: generation.spec.version,
      lastGeneratedAt: meta?.lastGeneratedAt ?? generation.generatedAt,
      createdNewVersion: generation.createdNewVersion,
      triggerReason: 'manual_regenerate'
    };
  }

  listSpecVersions(endpointId: string): EndpointSpecVersionsResponse {
    this.requireEndpoint(endpointId);

    return {
      endpointId,
      versions: this.specRepository.listVersions(endpointId)
    };
  }

  getSpecVersion(endpointId: string, version: number): EndpointSpecVersionItemResponse {
    this.requireEndpoint(endpointId);

    const record = this.specRepository.getVersion(endpointId, version);

    if (!record) {
      throw new ModuleError('SPEC_VERSION_NOT_FOUND', 404, 'Requested spec version was not found.');
    }

    return {
      endpointId,
      version: record.version,
      spec: record.spec,
      effectiveSpec: toEndpointEffectiveSpec(record.spec),
      specMetadata: toEndpointSpecBuildMetadata(record.spec, {
        triggerReason: record.triggerReason,
        includeInternal: true
      }),
      specLayered: toEndpointSpecLayered(record.spec, {
        triggerReason: record.triggerReason,
        includeSourceSnapshot: false,
        includeInternalMetadata: true
      }),
      isCurrent: record.isCurrent
    };
  }

  getSpecDiff(endpointId: string, fromVersion: number, toVersion: number): EndpointSpecDiffResponse {
    this.requireEndpoint(endpointId);

    if (!Number.isInteger(fromVersion) || fromVersion <= 0 || !Number.isInteger(toVersion) || toVersion <= 0) {
      throw new ModuleError('INVALID_DIFF_PARAMS', 400, 'Diff versions must be positive integers.');
    }

    const fromRecord = this.specRepository.getVersion(endpointId, fromVersion);
    if (!fromRecord) {
      throw new ModuleError('SPEC_VERSION_NOT_FOUND', 404, `Spec version ${fromVersion} was not found.`);
    }

    const toRecord = this.specRepository.getVersion(endpointId, toVersion);
    if (!toRecord) {
      throw new ModuleError('SPEC_VERSION_NOT_FOUND', 404, `Spec version ${toVersion} was not found.`);
    }

    const diff = diffEndpointSpecs(fromRecord.spec, toRecord.spec);

    return {
      endpointId,
      fromVersion,
      toVersion,
      changedKeys: diff.changedKeys,
      diffSummary: diff.summary,
      diff: diff.entries
    };
  }

  exportSpec(endpointId: string, version?: number): EndpointSpecExportResponse {
    this.requireEndpoint(endpointId);

    if (version !== undefined) {
      const byVersion = this.specRepository.getVersion(endpointId, version);

      if (!byVersion) {
        throw new ModuleError('SPEC_VERSION_NOT_FOUND', 404, `Spec version ${version} was not found.`);
      }

      return {
        endpointId,
        version: byVersion.version,
        spec: byVersion.spec,
        effectiveSpec: toEndpointEffectiveSpec(byVersion.spec),
        specMetadata: toEndpointSpecBuildMetadata(byVersion.spec, {
          triggerReason: byVersion.triggerReason,
          includeInternal: true
        }),
        specLayered: toEndpointSpecLayered(byVersion.spec, {
          triggerReason: byVersion.triggerReason,
          includeSourceSnapshot: true,
          includeInternalMetadata: true
        })
      };
    }

    const current = this.getCurrentSpec(endpointId);
    const currentVersionRecord = this.specRepository.getCurrentVersion(endpointId);
    const currentTrigger = currentVersionRecord?.triggerReason;

    return {
      endpointId,
      version: current.currentVersion,
      spec: current.currentSpec,
      effectiveSpec: current.currentEffectiveSpec,
      specMetadata:
        current.currentSpecMetadata.triggerReason || !currentTrigger
          ? current.currentSpecMetadata
          : {
              ...current.currentSpecMetadata,
              triggerReason: currentTrigger
            },
      specLayered: toEndpointSpecLayered(current.currentSpec, {
        triggerReason: currentTrigger,
        includeSourceSnapshot: true,
        includeInternalMetadata: true
      })
    };
  }

  private generateSpec(endpointId: string, triggerReason: SpecTriggerReason): SpecGenerationResult {
    const source = this.collectSourceData(endpointId);
    const content = this.buildSpecContent(source);
    const hash = createEndpointSpecHash(content);
    const existingCurrent = this.specRepository.getCurrentVersion(endpointId);
    const now = new Date().toISOString();

    if (existingCurrent && existingCurrent.hash === hash) {
      this.specRepository.setCurrentMeta(endpointId, existingCurrent.version, existingCurrent.hash, now);
      this.endpointRepository.markSpecStatusByEndpointId(endpointId, 'current');
      this.runtimeStateRepository.setSpecPointer(endpointId, {
        currentSpecId: existingCurrent.id,
        currentSpecVersion: existingCurrent.version,
        specStatus: 'current',
        invalidatePrompt: false,
        updatedAt: now
      });

      return {
        spec: existingCurrent.spec,
        createdNewVersion: false,
        generatedAt: now
      };
    }

    const version = existingCurrent ? existingCurrent.version + 1 : 1;
    const spec: EndpointSpec = {
      id: randomUUID(),
      endpointId,
      version,
      generatedAt: now,
      hash,
      ...content
    };

    this.specRepository.insertVersion({
      id: spec.id,
      endpointId,
      version,
      spec,
      hash,
      createdAt: now,
      triggerReason
    });

    this.specRepository.setCurrentMeta(endpointId, version, hash, now);
    this.endpointRepository.markSpecStatusByEndpointId(endpointId, 'current');
    this.runtimeStateRepository.setSpecPointer(endpointId, {
      currentSpecId: spec.id,
      currentSpecVersion: spec.version,
      specStatus: 'current',
      invalidatePrompt: true,
      updatedAt: now
    });

    return {
      spec,
      createdNewVersion: true,
      generatedAt: now
    };
  }

  private collectSourceData(endpointId: string): SourceCollectionResult {
    const endpoint = this.requireEndpoint(endpointId);

    const project = this.projectRepository.findById(endpoint.projectId);
    if (!project) {
      throw new ModuleError('PROJECT_NOT_FOUND', 400, 'Project for endpoint was not found.');
    }

    const group = endpoint.groupId ? this.groupRepository.findById(endpoint.groupId) : null;
    if (endpoint.groupId && !group) {
      throw new ModuleError('GROUP_NOT_FOUND', 400, 'Group for endpoint was not found.');
    }

    const schemaRow = this.endpointRepository.getSchemaByEndpointId(endpointId);
    if (!schemaRow) {
      throw new ModuleError('SCHEMA_NOT_FOUND', 400, 'Endpoint schema data is missing.');
    }

    const inputMode = normalizeInputMode(schemaRow.input_mode);
    const inputSchema = parseStoredInputSchema(inputMode, schemaRow.input_schema);
    const outputSchema = parseStoredOutputSchema(schemaRow.output_schema);

    const provider = endpoint.providerId ? this.getProviderSnapshot(endpoint.providerId) : null;
    const providerSupportsStructuredOutput = provider?.supportsStructuredOutput ?? false;
    const resolvedModel = endpoint.model ?? provider?.defaultModel ?? null;

    const sourceSnapshot: EndpointSpecSourceSnapshot = {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        baseInstruction: project.baseInstruction,
        defaultProviderId: project.defaultProviderId,
        apiNamespace: project.apiNamespace,
        settings: {
          enableObservability: project.enableObservability
        },
        updatedAt: project.updatedAt
      },
      group: group
        ? {
            id: group.id,
            projectId: group.projectId,
            name: group.name,
            description: group.description,
            groupInstruction: group.groupInstruction,
            updatedAt: group.updatedAt
          }
        : null,
      endpoint: {
        id: endpoint.id,
        projectId: endpoint.projectId,
        groupId: endpoint.groupId,
        providerId: endpoint.providerId,
        name: endpoint.name,
        pathSlug: endpoint.pathSlug,
        model: endpoint.model,
        endpointInstruction: endpoint.endpointInstruction,
        description: endpoint.description,
        rules: endpoint.rules,
        examples: endpoint.examples,
        tone: endpoint.tone,
        fallback: endpoint.fallback,
        validation: endpoint.validation,
        timeoutMs: endpoint.timeoutMs,
        runtimeOptions: {
          enableStructuredOutput: endpoint.enableStructuredOutput,
          enableDeterministicRepair: endpoint.enableDeterministicRepair,
          maxApiRetries: endpoint.maxApiRetries,
          maxRepairRounds: endpoint.maxRepairRounds,
          temperature: endpoint.temperature,
          topP: endpoint.topP
        },
        routePreview: endpoint.routePreview,
        specStatus: endpoint.specStatus,
        updatedAt: endpoint.updatedAt
      },
      schema: {
        inputMode,
        inputSchema,
        outputSchema,
        schemaUpdatedAt: schemaRow.schema_updated_at
      },
      provider: provider
        ? {
            id: provider.id,
            name: provider.name,
            type: provider.type,
            baseUrl: provider.baseUrl,
            defaultModel: provider.defaultModel,
            supportsStructuredOutput: provider.supportsStructuredOutput,
            timeoutMs: provider.timeoutMs
          }
        : null
    };

    return {
      endpoint,
      inputMode,
      inputSchema,
      outputSchema,
      sourceSnapshot,
      providerSupportsStructuredOutput,
      resolvedModel
    };
  }

  private buildSpecContent(source: SourceCollectionResult): EndpointSpecContent {
    const outputAllowAdditional = true;
    const outputIsTextMode = isTextModeOutputSchema(source.outputSchema);
    const hasStructuredOutputSchema = source.outputSchema.type === 'object' && !outputIsTextMode;
    const endpointInstruction = buildEndpointInstructionWithAutoJsonGuard(
      source.endpoint.endpointInstruction,
      hasStructuredOutputSchema
    );

    const strictnessPolicy = buildDefaultStrictnessPolicy({
      allowAdditionalProperties: outputAllowAdditional,
      inputMode: source.inputMode
    });

    const validationPolicy = buildDefaultValidationPolicy(outputAllowAdditional);
    const structuredOutputStrategy = buildDefaultStructuredOutputStrategy({
      providerSupportsStructuredOutput: source.providerSupportsStructuredOutput,
      hasOutputSchema: hasStructuredOutputSchema
    });
    const repairPolicy = buildDefaultRepairPolicy({
      enableDeterministicRepair: source.endpoint.enableDeterministicRepair,
      maxRepairRounds: source.endpoint.maxRepairRounds
    });

    return {
      sourceSnapshot: source.sourceSnapshot,
      instructions: {
        base: source.sourceSnapshot.project.baseInstruction,
        group: source.sourceSnapshot.group?.groupInstruction ?? null,
        endpoint: endpointInstruction
      },
      description: source.endpoint.description,
      rules: source.endpoint.rules,
      examples: source.endpoint.examples,
      tone: source.endpoint.tone,
      fallback: source.endpoint.fallback,
      validationPolicy,
      input: {
        mode: source.inputMode,
        schema: source.inputSchema
      },
      output: {
        schema: source.outputSchema
      },
      structuredOutputStrategy,
      strictnessPolicy,
      repairPolicy,
      providerCapability: {
        providerId: source.sourceSnapshot.provider?.id ?? null,
        providerName: source.sourceSnapshot.provider?.name ?? null,
        providerType: source.sourceSnapshot.provider?.type ?? null,
        supportsStructuredOutput: source.providerSupportsStructuredOutput,
        defaultModel: source.sourceSnapshot.provider?.defaultModel ?? null,
        baseUrl: source.sourceSnapshot.provider?.baseUrl ?? null,
        timeoutMs: source.sourceSnapshot.provider?.timeoutMs ?? source.endpoint.timeoutMs
      },
      promptGenerationMeta: {
        specCoreVersion: '0.1.0',
        specBuilderVersion: 'phase6-effective-spec-pipeline-v1',
        generatedFromStatus: normalizeSpecStatus(source.endpoint.specStatus),
        routePreview: source.endpoint.routePreview,
        resolvedModel: source.resolvedModel
      }
    };
  }

  private resolveTriggerReason(
    endpointStatus: SpecStatus,
    pendingReason: SpecTriggerReason | undefined,
    hasCurrentVersion: boolean
  ): SpecTriggerReason {
    if (pendingReason) {
      return pendingReason;
    }

    if (!hasCurrentVersion || endpointStatus === 'missing') {
      return 'initial';
    }

    if (endpointStatus === 'stale') {
      return 'system_rebuild';
    }

    return 'system_rebuild';
  }

  private requireEndpoint(endpointId: string): EndpointSummary {
    const endpoint = this.endpointRepository.findById(endpointId);

    if (!endpoint) {
      throw new ModuleError('ENDPOINT_NOT_FOUND', 404, 'Endpoint not found.');
    }

    return endpoint;
  }

  private getProviderSnapshot(providerId: string): {
    id: string;
    name: string;
    type: ProviderType;
    baseUrl: string | null;
    defaultModel: string;
    supportsStructuredOutput: boolean;
    timeoutMs: number;
  } | null {
    const provider = this.providerRegistry.getSummary(providerId);
    if (!provider) {
      return null;
    }

    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl,
      defaultModel: provider.defaultModel,
      supportsStructuredOutput: provider.supportsStructuredOutput,
      timeoutMs: provider.timeoutMs
    };
  }
}
