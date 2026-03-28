
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type EndpointSpec,
  type ExportProjectPreflightResponse,
  type ExportProjectResponse,
  type ExportReadyEndpointItem,
  type ExportSkippedEndpointItem,
  type ExportType,
  type InputMode
} from '@contrix/spec-core';
import type { PromptSnapshotModel } from '@contrix/spec-core';
import type { SQLiteDatabase } from '../../db/types.js';
import { ModuleError } from '../common/errors.js';
import { EndpointRepository } from '../endpoint/repository.js';
import { ProjectRepository } from '../project/repository.js';
import { ProviderRegistry } from '../provider/registry.js';
import { PromptRepository } from '../prompt/repository.js';
import { RuntimeStateRepository } from '../runtime/state-repository.js';
import { SpecService } from '../spec/service.js';
import type {
  ExportArtifacts,
  ExportPayload,
  ExportPreparationResult,
  ExportProviderConfig,
  ExportRouteRecord,
  ExportableEndpointContext,
  NormalizedExportOptions
} from './model.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '../../../../../');
const DEFAULT_EXPORT_ROOT = path.resolve(REPO_ROOT, 'dist', 'project-export');
const DEFAULT_ROUTE_PREFIX = '/runtime';
const DEFAULT_RUNTIME_HOST = 'localhost';
const DEFAULT_RUNTIME_PORT = 4411;
const SENSITIVE_HEADER_PATTERN = /(authorization|api[-_]?key|token|secret|password)/i;

const DEFAULT_BASE_URL_BY_PROVIDER: Record<string, string | null> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  anthropic: 'https://api.anthropic.com/v1',
  'openai-compatible': null,
  custom: null
};

function toErrorMessage(error: unknown): string {
  if (error instanceof ModuleError) {
    return error.message;
  }

  return error instanceof Error ? error.message : 'Unknown error';
}

function slugify(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'item';
}

function toEnvKey(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildProviderRef(providerName: string, providerId: string): string {
  const idPart = slugify(providerId).slice(0, 12) || 'provider';
  return `provider_${slugify(providerName)}_${idPart}`;
}

function buildProviderEnv(providerRef: string) {
  const prefix = toEnvKey(providerRef);
  return {
    apiKey: `${prefix}_API_KEY`,
    baseUrl: `${prefix}_BASE_URL`,
    defaultModel: `${prefix}_MODEL`,
    timeoutMs: `${prefix}_TIMEOUT_MS`
  };
}

function normalizeExportOptions(payload: ExportPayload | undefined): NormalizedExportOptions {
  const exportType: ExportType = payload?.exportType ?? 'runtime-config-pack';

  return {
    exportType,
    outputDir: payload?.outputDir?.trim() || null,
    includeExamples: payload?.includeExamples ?? true,
    includeDocs: payload?.includeDocs ?? true,
    includeStandaloneRuntime:
      payload?.includeStandaloneRuntime ?? exportType === 'standalone-runtime-bundle',
    includeEmbeddableRuntime:
      payload?.includeEmbeddableRuntime ?? exportType === 'embeddable-runtime-package'
  };
}

function resolveOutputDir(namespace: string, options: NormalizedExportOptions): string {
  if (options.outputDir) {
    if (path.isAbsolute(options.outputDir)) {
      return options.outputDir;
    }

    return path.resolve(REPO_ROOT, options.outputDir);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.resolve(DEFAULT_EXPORT_ROOT, `${namespace}-${timestamp}`);
}

function sanitizeProviderHeaders(headers: Record<string, string>): {
  headers: Record<string, string>;
  removedSensitiveKeys: string[];
} {
  const safe: Record<string, string> = {};
  const removed: string[] = [];

  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADER_PATTERN.test(key)) {
      removed.push(key);
      continue;
    }

    safe[key] = value;
  }

  return {
    headers: safe,
    removedSensitiveKeys: removed
  };
}

function pushRelativeFile(target: string[], rootDir: string, filePath: string): void {
  target.push(path.relative(rootDir, filePath).replace(/\\/g, '/'));
}
function buildRuntimeSharedTemplate(): string {
  return [
    "import fs from 'node:fs/promises';",
    "import path from 'node:path';",
    "import Ajv from 'ajv';",
    '',
    'const CODE_FENCE = /^\\s*```(?:json)?\\s*([\\s\\S]*?)\\s*```\\s*$/i;',
    '',
    'function parseJsonSafe(raw) {',
    '  try {',
    '    return { ok: true, value: JSON.parse(raw) };',
    '  } catch (error) {',
    '    return { ok: false, error: error instanceof Error ? error.message : "Invalid JSON" };',
    '  }',
    '}',
    '',
    'function stripFence(rawText) {',
    '  const match = String(rawText).trim().match(CODE_FENCE);',
    '  return match ? match[1] : String(rawText);',
    '}',
    '',
    'function extractJson(rawText) {',
    '  const direct = parseJsonSafe(rawText);',
    '  if (direct.ok) return { parsed: direct.value, extracted: String(rawText), method: "direct" };',
    '  const stripped = stripFence(rawText);',
    '  const parsed = parseJsonSafe(stripped);',
    '  if (parsed.ok) return { parsed: parsed.value, extracted: stripped, method: "markdown_strip" };',
    '  return { parsed: null, extracted: null, method: "failed" };',
    '}',
    '',
    'function deterministicRepair(rawText) {',
    '  let text = stripFence(rawText);',
    "  text = text.replace(/[\\u2018\\u2019]/g, \"'\");",
    '  text = text.replace(/[\\u201C\\u201D]/g, "\"");',
    '  text = text.replace(/,\\s*([}\\]])/g, "$1");',
    '  const parsed = parseJsonSafe(text);',
    '  return { changed: text !== rawText, parsed: parsed.ok ? parsed.value : null, repairedText: text };',
    '}',
    '',
    'function renderPrompt(template, inputMode, body) {',
    '  const text = inputMode === "text" ? String(body.inputText || "") : "";',
    '  const json = inputMode === "json" ? JSON.stringify(body.inputJson ?? {}, null, 2) : "";',
    '  return String(template)',
    '    .replace(/\\{\\{INPUT_TEXT\\}\\}/g, text)',
    '    .replace(/\\{\\{INPUT_JSON\\}\\}/g, json);',
    '}',
    '',
    'export async function loadRuntimeProject(baseDir) {',
    '  const [specText, routerText, configText] = await Promise.all([',
    '    fs.readFile(path.join(baseDir, "spec.json"), "utf8"),',
    '    fs.readFile(path.join(baseDir, "router.json"), "utf8"),',
    '    fs.readFile(path.join(baseDir, "runtime.config.json"), "utf8")',
    '  ]);',
    '  return { spec: JSON.parse(specText), router: JSON.parse(routerText), runtimeConfig: JSON.parse(configText) };',
    '}',
    '',
    'export function resolveProviderConfigFromEnv(providerRef, runtimeConfig) {',
    '  const provider = runtimeConfig.providers.find((item) => item.providerRef === providerRef);',
    '  if (!provider) throw new Error("Provider mapping is missing for " + providerRef);',
    '  const apiKey = process.env[provider.env.apiKey];',
    '  if (!apiKey) throw new Error("Missing env " + provider.env.apiKey);',
    '  const baseUrl = process.env[provider.env.baseUrl] || provider.defaultBaseUrl;',
    '  if (!baseUrl) throw new Error("Missing base url env " + provider.env.baseUrl);',
    '  const model = process.env[provider.env.defaultModel] || provider.defaultModel || null;',
    '  const timeoutRaw = process.env[provider.env.timeoutMs];',
    '  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : provider.defaultTimeoutMs;',
    '  return {',
    '    providerRef: provider.providerRef,',
    '    providerType: provider.providerType,',
    '    apiKey,',
    '    baseUrl: String(baseUrl).replace(/\\/+$/, ""),',
    '    model,',
    '    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000,',
    '    headers: provider.staticHeaders || {}',
    '  };',
    '}',
    '',
    'async function callProvider(config, model, prompt, timeoutMs, temperature, topP) {',
    '  const controller = new AbortController();',
    '  const timer = setTimeout(() => controller.abort(), timeoutMs);',
    '  try {',
    '    const response = await fetch(config.baseUrl + "/chat/completions", {',
    '      method: "POST",',
    '      signal: controller.signal,',
    '      headers: {',
    '        "Content-Type": "application/json",',
    '        Authorization: "Bearer " + config.apiKey,',
    '        ...config.headers',
    '      },',
    '      body: JSON.stringify({',
    '        model,',
    '        messages: [{ role: "user", content: prompt }],',
    '        temperature: temperature ?? undefined,',
    '        top_p: topP ?? undefined',
    '      })',
    '    });',
    '    const data = await response.json().catch(() => ({}));',
    '    if (!response.ok) throw new Error(data?.error?.message || "Provider call failed with status " + response.status);',
    '    return {',
    '      rawText: data?.choices?.[0]?.message?.content ?? "",',
    '      finishReason: data?.choices?.[0]?.finish_reason ?? null,',
    '      usage: {',
    '        inputTokens: data?.usage?.prompt_tokens ?? null,',
    '        outputTokens: data?.usage?.completion_tokens ?? null,',
    '        totalTokens: data?.usage?.total_tokens ?? null,',
    '        cachedInputTokens: data?.usage?.prompt_tokens_details?.cached_tokens ?? null',
    '      }',
    '    };',
    '  } finally {',
    '    clearTimeout(timer);',
    '  }',
    '}',
    'export async function createRuntimeHandler(bundle) {',
    '  const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });',
    '  const validators = new Map();',
    '  return async function handler(request, reply) {',
    '    const namespace = request.params.namespace;',
    '    const pathSlug = request.params.pathSlug;',
    '    const route = bundle.router.routes.find((item) => item.pathSlug === pathSlug && bundle.router.namespace === namespace);',
    '    if (!route) return reply.code(404).send({ success: false, error: { type: "ENDPOINT_NOT_FOUND", stage: "route_resolve", message: "Route not found" } });',
    '    const body = request.body || {};',
    '    if (route.inputMode === "text" && typeof body.inputText !== "string") return reply.code(400).send({ success: false, error: { type: "INPUT_MODE_MISMATCH", stage: "request_validation", message: "inputText is required" } });',
    '    if (route.inputMode === "json" && (!body.inputJson || typeof body.inputJson !== "object" || Array.isArray(body.inputJson))) return reply.code(400).send({ success: false, error: { type: "INPUT_MODE_MISMATCH", stage: "request_validation", message: "inputJson object is required" } });',
    '    if (!validators.has(route.endpointId)) validators.set(route.endpointId, ajv.compile(route.outputJsonSchema));',
    '    const validate = validators.get(route.endpointId);',
    '    const providerConfig = resolveProviderConfigFromEnv(route.providerRef, bundle.runtimeConfig);',
    '    const model = (typeof body.overrideModel === "string" && body.overrideModel.trim()) ? body.overrideModel.trim() : (providerConfig.model || route.model);',
    '    if (!model) return reply.code(400).send({ success: false, error: { type: "MODEL_NOT_CONFIGURED", stage: "resource_load", message: "No model configured" } });',
    '    const initialPrompt = renderPrompt(route.promptTemplate, route.inputMode, body);',
    '    const maxProviderCalls = Math.min(3, Math.max(1, Number(route.runtimePolicy.maxApiRetries ?? 3) + 1));',
    '    const attempts = [];',
    '    let prompt = initialPrompt;',
    '    let lastRawOutput = null;',
    '    for (let index = 1; index <= maxProviderCalls; index += 1) {',
    '      const startedAt = new Date().toISOString();',
    '      const result = await callProvider(providerConfig, model, prompt, Number(route.runtimePolicy.timeoutMs ?? providerConfig.timeoutMs), route.runtimePolicy.temperature ?? null, route.runtimePolicy.topP ?? null).catch((error) => ({ error }));',
    '      const finishedAt = new Date().toISOString();',
    '      if (result.error) { attempts.push({ attemptIndex: index, startedAt, finishedAt, error: String(result.error?.message || result.error) }); continue; }',
    '      lastRawOutput = result.rawText;',
    '      const extracted = extractJson(result.rawText);',
    '      if (extracted.parsed !== null && validate(extracted.parsed)) {',
    '        attempts.push({ attemptIndex: index, startedAt, finishedAt, extractionMethod: extracted.method, repaired: false });',
    '        return reply.send({ success: true, endpointId: route.endpointId, endpointName: route.endpointName, namespace, pathSlug, providerRef: route.providerRef, providerType: route.providerType, model, specVersion: route.specVersion, promptHash: route.promptHash, finalOutputJson: extracted.parsed, finalOutputRawText: result.rawText, outputSource: index === 1 ? "provider_direct_valid" : "repair_retry_valid", usage: result.usage, finishReason: result.finishReason, attemptCount: attempts.length, attempts });',
    '      }',
    '      const repaired = deterministicRepair(extracted.extracted || result.rawText);',
    '      if (repaired.parsed !== null && validate(repaired.parsed)) {',
    '        attempts.push({ attemptIndex: index, startedAt, finishedAt, extractionMethod: extracted.method, repaired: true });',
    '        return reply.send({ success: true, endpointId: route.endpointId, endpointName: route.endpointName, namespace, pathSlug, providerRef: route.providerRef, providerType: route.providerType, model, specVersion: route.specVersion, promptHash: route.promptHash, finalOutputJson: repaired.parsed, finalOutputRawText: result.rawText, outputSource: index === 1 ? "deterministic_repair" : "repair_retry_deterministic_repair", usage: result.usage, finishReason: result.finishReason, attemptCount: attempts.length, attempts });',
    '      }',
    '      attempts.push({ attemptIndex: index, startedAt, finishedAt, extractionMethod: extracted.method, repaired: false, validationErrors: validate.errors || [] });',
    '      prompt = initialPrompt + "\\n\\nREPAIR REQUIRED: return valid JSON only.";',
    '    }',
    '    return reply.code(422).send({ success: false, endpointId: route.endpointId, endpointName: route.endpointName, namespace, pathSlug, providerRef: route.providerRef, providerType: route.providerType, model, specVersion: route.specVersion, promptHash: route.promptHash, error: { type: "MAX_ATTEMPTS_EXCEEDED", stage: "validation", message: "Failed to produce valid JSON output" }, attemptCount: attempts.length, attempts, lastRawOutput, lastValidationIssues: validate.errors || [] });',
    '  };',
    '}',
    '',
    'export async function createStandaloneRuntimeServer(options) {',
    '  const fastifyModule = await import("fastify");',
    '  const app = fastifyModule.default({ logger: true });',
    '  const bundle = await loadRuntimeProject(options.baseDir);',
    '  const host = options.host || process.env.RUNTIME_HOST || bundle.runtimeConfig.runtime.host || "localhost";',
    '  const port = options.port || Number(process.env.RUNTIME_PORT || bundle.runtimeConfig.runtime.port || 4411);',
    '  const routePrefix = bundle.runtimeConfig.runtime.routePrefix || "/runtime";',
    '  const handler = await createRuntimeHandler(bundle);',
    '  app.get("/health", async () => ({ ok: true, server: "up", mode: "standalone-export", timestamp: new Date().toISOString() }));',
    '  app.post(routePrefix + "/:namespace/:pathSlug", handler);',
    '  return { app, config: { host, port, routePrefix }, bundle };',
    '}',
    ''
  ].join('\n');
}

function buildStandaloneRuntimeEntryTemplate(): string {
  return [
    "import path from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    "import { createStandaloneRuntimeServer } from './runtime-shared.js';",
    '',
    'const moduleDir = path.dirname(fileURLToPath(import.meta.url));',
    '',
    'try {',
    '  const runtime = await createStandaloneRuntimeServer({ baseDir: moduleDir });',
    '  await runtime.app.listen({ host: runtime.config.host, port: runtime.config.port });',
    '  runtime.app.log.info("Standalone runtime listening on http://" + runtime.config.host + ":" + runtime.config.port);',
    '} catch (error) {',
    "  console.error('Failed to start standalone runtime:', error);",
    '  process.exit(1);',
    '}',
    ''
  ].join('\n');
}

function buildEmbeddableTemplate(): string {
  return [
    'export {',
    '  loadRuntimeProject,',
    '  resolveProviderConfigFromEnv,',
    '  createRuntimeHandler,',
    '  createStandaloneRuntimeServer',
    "} from './runtime-shared.js';",
    ''
  ].join('\n');
}

function buildExportPackageJsonTemplate(): string {
  return JSON.stringify(
    {
      name: 'contrix-runtime-export',
      private: true,
      type: 'module',
      dependencies: {
        ajv: '^8.17.1',
        fastify: '^5.6.1'
      }
    },
    null,
    2
  );
}
function createOpenApiLikeDocument(artifacts: ExportArtifacts) {
  const paths: Record<string, unknown> = {};

  for (const route of artifacts.router.routes) {
    const pathKey = `/${artifacts.router.namespace}/${route.pathSlug}`;
    const requestSchema =
      route.inputMode === 'text'
        ? {
            type: 'object',
            required: ['inputText'],
            properties: {
              inputText: { type: 'string' },
              overrideModel: { type: 'string' }
            }
          }
        : {
            type: 'object',
            required: ['inputJson'],
            properties: {
              inputJson: route.inputJsonSchema ?? { type: 'object' },
              overrideModel: { type: 'string' }
            }
          };

    paths[pathKey] = {
      post: {
        summary: route.endpointName,
        operationId: `run_${route.endpointId}`,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: requestSchema
            }
          }
        },
        responses: {
          '200': {
            description: 'Runtime execution success',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    finalOutputJson: route.outputJsonSchema,
                    attemptCount: { type: 'integer' },
                    specVersion: { type: 'integer' },
                    promptHash: { type: 'string' }
                  }
                }
              }
            }
          },
          '422': {
            description: 'Runtime execution failed'
          }
        }
      }
    };
  }

  return {
    openapi: '3.1.0-like',
    info: {
      title: `${artifacts.project.name} Runtime Contract`,
      version: '1.0.0',
      description: 'Generated by Contrix export pipeline'
    },
    servers: [
      {
        url: artifacts.runtimeConfig.runtime.routePrefix
      }
    ],
    paths
  };
}

function createEndpointsDoc(artifacts: ExportArtifacts) {
  return {
    project: artifacts.project,
    generatedAt: artifacts.generatedAt,
    endpoints: artifacts.router.routes.map((route) => ({
      endpointId: route.endpointId,
      endpointName: route.endpointName,
      fullPath: route.fullPath,
      providerRef: route.providerRef,
      providerType: route.providerType,
      model: route.model,
      inputMode: route.inputMode,
      specVersion: route.specVersion,
      promptHash: route.promptHash,
      runtimePolicy: route.runtimePolicy
    }))
  };
}

function buildExamples(artifacts: ExportArtifacts) {
  const first = artifacts.router.routes[0];
  if (!first) {
    return {
      python: '# No export-ready endpoints found.',
      js: '// No export-ready endpoints found.',
      curl: '# No export-ready endpoints found.',
      java: '// No export-ready endpoints found.',
      cpp: '// No export-ready endpoints found.'
    };
  }

  const baseUrl = `http://localhost:${artifacts.runtimeConfig.runtime.port}${artifacts.runtimeConfig.runtime.routePrefix}`;
  const endpointUrl = `${baseUrl}/${artifacts.router.namespace}/${first.pathSlug}`;
  const payload =
    first.inputMode === 'json'
      ? JSON.stringify({ inputJson: { sample: 'value' } }, null, 2)
      : JSON.stringify({ inputText: 'Sample text input' }, null, 2);

  return {
    python: `import requests

url = "${endpointUrl}"
payload = ${payload}

response = requests.post(url, json=payload, timeout=60)
print(response.status_code)
print(response.json())
`,
    js: `const url = "${endpointUrl}";
const payload = ${payload};

const response = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
});
console.log(await response.json());
`,
    curl: `curl -X POST "${endpointUrl}" \\
  -H "Content-Type: application/json" \\
  -d '${payload.replace(/\n/g, ' ')}'
`,
    java: `// Java 11+ minimal HttpClient example
var client = java.net.http.HttpClient.newHttpClient();
var request = java.net.http.HttpRequest.newBuilder()
    .uri(java.net.URI.create("${endpointUrl}"))
    .header("Content-Type", "application/json")
    .POST(java.net.http.HttpRequest.BodyPublishers.ofString("${payload.replace(/"/g, '\\"').replace(/\n/g, '')}"))
    .build();
var response = client.send(request, java.net.http.HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());
`,
    cpp: `// C++ minimal example (pseudo)
// POST ${endpointUrl}
// Content-Type: application/json
// Body:
${payload}
`
  };
}

function buildReadme(artifacts: ExportArtifacts, options: NormalizedExportOptions): string {
  const endpointLines = artifacts.router.routes.map(
    (route) => `- \`${route.fullPath}\` (${route.inputMode}, spec v${route.specVersion})`
  );
  const envLines = artifacts.runtimeConfig.providers.flatMap((provider) => [
    `- \`${provider.env.apiKey}\` (required)`,
    `- \`${provider.env.baseUrl}\` (optional, default: ${provider.defaultBaseUrl ?? 'none'})`,
    `- \`${provider.env.defaultModel}\` (optional, default: ${provider.defaultModel || 'none'})`,
    `- \`${provider.env.timeoutMs}\` (optional, default: ${provider.defaultTimeoutMs})`
  ]);

  return `# ${artifacts.project.name} Export

This artifact is generated by Contrix Phase 10 Packaging + Export.

## Project
- ID: \`${artifacts.project.id}\`
- Namespace: \`${artifacts.project.apiNamespace}\`
- Generated At: \`${artifacts.generatedAt}\`

## Endpoints
${endpointLines.join('\n')}

## Environment Variables
${envLines.join('\n')}

## Standalone Runtime
${options.includeStandaloneRuntime ? `1. \`npm install\`
2. \`node runtime.js\`
3. \`GET /health\` and \`POST /runtime/{namespace}/{pathSlug}\`` : 'Standalone runtime not included in this export.'}

## Files
- \`spec.json\`
- \`router.json\`
- \`runtime.config.json\`
- \`README.md\`

## Security Notes
- API keys are NOT exported.
- Sensitive provider headers are stripped.
- Runtime reads provider credentials from env variables.
`;
}

export class ExportService {
  private readonly endpointRepository: EndpointRepository;
  private readonly projectRepository: ProjectRepository;
  private readonly providerRegistry: ProviderRegistry;
  private readonly promptRepository: PromptRepository;
  private readonly runtimeStateRepository: RuntimeStateRepository;
  private readonly specService: SpecService;

  constructor(db: SQLiteDatabase) {
    this.endpointRepository = new EndpointRepository(db);
    this.projectRepository = new ProjectRepository(db);
    this.providerRegistry = new ProviderRegistry(db);
    this.promptRepository = new PromptRepository(db);
    this.runtimeStateRepository = new RuntimeStateRepository(db);
    this.specService = new SpecService(db);
  }

  getPreflight(projectId: string): ExportProjectPreflightResponse {
    return this.prepareExport(projectId).preflight;
  }

  async exportProject(projectId: string, payload?: ExportPayload): Promise<ExportProjectResponse> {
    const options = normalizeExportOptions(payload);
    const prepared = this.prepareExport(projectId);

    if (!prepared.preflight.exportReady) {
      throw new ModuleError(
        'EXPORT_PREFLIGHT_FAILED',
        400,
        `Export preflight failed: ${prepared.preflight.blockingIssues.join('; ') || 'unknown issue'}`
      );
    }

    const outputDir = resolveOutputDir(prepared.artifacts.project.apiNamespace, options);
    await fs.mkdir(outputDir, { recursive: true });

    const exportedFiles: string[] = [];
    const writeJson = async (name: string, value: unknown) => {
      const target = path.join(outputDir, name);
      await fs.writeFile(target, JSON.stringify(value, null, 2), 'utf8');
      pushRelativeFile(exportedFiles, outputDir, target);
    };

    await writeJson('spec.json', prepared.artifacts.spec);
    await writeJson('router.json', prepared.artifacts.router);
    await writeJson('runtime.config.json', prepared.artifacts.runtimeConfig);

    if (options.includeStandaloneRuntime || options.includeEmbeddableRuntime) {
      const runtimeSharedPath = path.join(outputDir, 'runtime-shared.js');
      await fs.writeFile(runtimeSharedPath, buildRuntimeSharedTemplate(), 'utf8');
      pushRelativeFile(exportedFiles, outputDir, runtimeSharedPath);

      const packageJsonPath = path.join(outputDir, 'package.json');
      await fs.writeFile(packageJsonPath, buildExportPackageJsonTemplate(), 'utf8');
      pushRelativeFile(exportedFiles, outputDir, packageJsonPath);
    }

    if (options.includeStandaloneRuntime) {
      const runtimeEntryPath = path.join(outputDir, 'runtime.js');
      await fs.writeFile(runtimeEntryPath, buildStandaloneRuntimeEntryTemplate(), 'utf8');
      pushRelativeFile(exportedFiles, outputDir, runtimeEntryPath);
    }

    if (options.includeEmbeddableRuntime) {
      const embeddablePath = path.join(outputDir, 'runtime-embed.js');
      await fs.writeFile(embeddablePath, buildEmbeddableTemplate(), 'utf8');
      pushRelativeFile(exportedFiles, outputDir, embeddablePath);
    }

    if (options.includeExamples) {
      const examplesDir = path.join(outputDir, 'examples');
      await fs.mkdir(examplesDir, { recursive: true });
      const examples = buildExamples(prepared.artifacts);
      const files = [
        { name: 'python_example.py', content: examples.python },
        { name: 'js_example.js', content: examples.js },
        { name: 'curl_example.sh', content: examples.curl },
        { name: 'java_example.txt', content: examples.java },
        { name: 'cpp_example.txt', content: examples.cpp }
      ];

      for (const file of files) {
        const target = path.join(examplesDir, file.name);
        await fs.writeFile(target, file.content, 'utf8');
        pushRelativeFile(exportedFiles, outputDir, target);
      }
    }

    if (options.includeDocs) {
      const docsDir = path.join(outputDir, 'docs');
      await fs.mkdir(docsDir, { recursive: true });
      const openApiPath = path.join(docsDir, 'contract.openapi.json');
      const endpointsPath = path.join(docsDir, 'endpoints.json');
      await fs.writeFile(openApiPath, JSON.stringify(createOpenApiLikeDocument(prepared.artifacts), null, 2), 'utf8');
      await fs.writeFile(endpointsPath, JSON.stringify(createEndpointsDoc(prepared.artifacts), null, 2), 'utf8');
      pushRelativeFile(exportedFiles, outputDir, openApiPath);
      pushRelativeFile(exportedFiles, outputDir, endpointsPath);
    }

    const readmePath = path.join(outputDir, 'README.md');
    await fs.writeFile(readmePath, buildReadme(prepared.artifacts, options), 'utf8');
    pushRelativeFile(exportedFiles, outputDir, readmePath);

    return {
      success: true,
      projectId: prepared.artifacts.project.id,
      exportPath: outputDir,
      exportType: options.exportType,
      exportedFiles,
      warnings: prepared.preflight.warnings
    };
  }

  private prepareExport(projectId: string): ExportPreparationResult {
    const project = this.projectRepository.findById(projectId);
    if (!project) {
      throw new ModuleError('PROJECT_NOT_FOUND', 404, 'Project not found.');
    }

    const endpoints = this.endpointRepository.list({ projectId });
    const readyEndpoints: ExportReadyEndpointItem[] = [];
    const skippedEndpoints: ExportSkippedEndpointItem[] = [];
    const warnings: string[] = [];
    const blockingIssues: string[] = [];
    const contexts: ExportableEndpointContext[] = [];
    const providerConfigByRef = new Map<string, ExportProviderConfig>();

    if (endpoints.length === 0) {
      blockingIssues.push('Project has no endpoints.');
    }

    for (const endpoint of endpoints) {
      const reasons: string[] = [];
      const endpointWarnings: string[] = [];

      if (!endpoint.providerId) {
        reasons.push('providerId is missing');
      }

      const provider = endpoint.providerId ? this.providerRegistry.resolveByKey(endpoint.providerId) : null;
      if (endpoint.providerId && !provider) {
        reasons.push('provider record not found');
      }

      let spec: EndpointSpec | null = null;
      let effectiveSpec: ReturnType<SpecService['getCurrentSpec']>['currentEffectiveSpec'] | null = null;
      try {
        const currentSpec = this.specService.getCurrentSpec(endpoint.id);
        spec = currentSpec.currentSpec;
        effectiveSpec = currentSpec.currentEffectiveSpec;
      } catch (error) {
        reasons.push(`spec unavailable: ${toErrorMessage(error)}`);
      }

      this.runtimeStateRepository.ensureEndpointState(endpoint.id, endpoint.specStatus);
      const runtimeState = this.runtimeStateRepository.getEndpointState(endpoint.id);
      if (!runtimeState) {
        reasons.push('runtime state missing');
      } else if (runtimeState.promptStatus !== 'current') {
        reasons.push(
          runtimeState.promptStatus === 'compile_error'
            ? `prompt compile error: ${runtimeState.lastPromptCompileError ?? 'unknown'}`
            : `prompt status ${runtimeState.promptStatus}`
        );
      }

      let promptSnapshot: PromptSnapshotModel | null = null;
      if (runtimeState?.currentPromptSnapshotId) {
        promptSnapshot = this.promptRepository.findById(runtimeState.currentPromptSnapshotId);
      }
      if (!promptSnapshot) {
        reasons.push('current prompt snapshot missing');
      }

      if (spec && promptSnapshot && (promptSnapshot.specId !== spec.id || promptSnapshot.specVersion !== spec.version)) {
        reasons.push('prompt snapshot does not match current spec');
      }

      if (provider && !endpoint.model && !provider.defaultModel) {
        endpointWarnings.push('no endpoint.model and no provider.defaultModel, set model via env at runtime');
      }

      if (reasons.length > 0 || !provider || !spec || !effectiveSpec || !promptSnapshot) {
        skippedEndpoints.push({
          endpointId: endpoint.id,
          endpointName: endpoint.name,
          reasons
        });
        continue;
      }

      const providerRef = buildProviderRef(provider.name, provider.providerKey);
      const env = buildProviderEnv(providerRef);
      const sanitized = sanitizeProviderHeaders(provider.headers);
      if (sanitized.removedSensitiveKeys.length > 0) {
        endpointWarnings.push(
          `removed sensitive provider headers: ${sanitized.removedSensitiveKeys.join(', ')}`
        );
      }

      const providerConfig: ExportProviderConfig = {
        providerRef,
        providerId: provider.providerKey,
        providerName: provider.name,
        providerType: provider.type,
        defaultBaseUrl: provider.baseUrl ?? DEFAULT_BASE_URL_BY_PROVIDER[provider.type] ?? null,
        defaultModel: provider.defaultModel,
        defaultTimeoutMs: provider.timeoutMs,
        staticHeaders: sanitized.headers,
        env
      };
      providerConfigByRef.set(providerRef, providerConfig);

      const routeRecord: ExportRouteRecord = {
        endpointId: endpoint.id,
        endpointName: endpoint.name,
        pathSlug: endpoint.pathSlug,
        fullPath: `${DEFAULT_ROUTE_PREFIX}/${project.apiNamespace}/${endpoint.pathSlug}`,
        routePreview: endpoint.routePreview,
        providerRef,
        providerType: provider.type,
        inputMode: spec.input.mode as InputMode,
        specId: spec.id,
        specVersion: spec.version,
        promptHash: promptSnapshot.promptHash,
        promptTemplate: promptSnapshot.promptText,
        model: endpoint.model ?? provider.defaultModel ?? null,
        inputJsonSchema:
          spec.input.mode === 'json' &&
          effectiveSpec.input.schema &&
          typeof effectiveSpec.input.schema === 'object' &&
          'type' in effectiveSpec.input.schema
            ? effectiveSpec.input.schema
            : null,
        outputJsonSchema: effectiveSpec.output.schema,
        validationPolicy: spec.validationPolicy,
        repairPolicy: spec.repairPolicy,
        structuredOutputStrategy: spec.structuredOutputStrategy,
        runtimePolicy: {
          timeoutMs: endpoint.timeoutMs ?? provider.timeoutMs ?? null,
          maxApiRetries: endpoint.maxApiRetries,
          maxRepairRounds: endpoint.maxRepairRounds,
          temperature: endpoint.temperature,
          topP: endpoint.topP
        }
      };

      readyEndpoints.push({
        endpointId: endpoint.id,
        endpointName: endpoint.name,
        pathSlug: endpoint.pathSlug,
        routePreview: endpoint.routePreview,
        providerRef,
        inputMode: routeRecord.inputMode,
        specVersion: routeRecord.specVersion,
        promptHash: routeRecord.promptHash,
        warnings: endpointWarnings
      });

      contexts.push({
        endpoint,
        providerRef,
        providerConfig,
        spec,
        promptSnapshot,
        route: routeRecord,
        warnings: endpointWarnings
      });

      warnings.push(...endpointWarnings.map((item) => `[${endpoint.name}] ${item}`));
    }

    if (readyEndpoints.length === 0) {
      blockingIssues.push('No export-ready endpoints. Resolve preflight issues first.');
    }

    const preflight: ExportProjectPreflightResponse = {
      projectId: project.id,
      projectName: project.name,
      namespace: project.apiNamespace,
      totalEndpoints: endpoints.length,
      exportReady: blockingIssues.length === 0 && readyEndpoints.length > 0,
      readyEndpoints,
      skippedEndpoints,
      warnings,
      blockingIssues
    };

    const artifacts: ExportArtifacts = {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        apiNamespace: project.apiNamespace
      },
      generatedAt: new Date().toISOString(),
      spec: {
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          apiNamespace: project.apiNamespace
        },
        generatedAt: new Date().toISOString(),
        endpoints: contexts.map((context) => ({
          endpointId: context.endpoint.id,
          name: context.endpoint.name,
          namespace: project.apiNamespace,
          pathSlug: context.endpoint.pathSlug,
          fullPath: context.route.fullPath,
          specVersion: context.spec.version,
          promptHash: context.promptSnapshot.promptHash,
          spec: context.spec
        }))
      },
      router: {
        projectId: project.id,
        projectName: project.name,
        namespace: project.apiNamespace,
        routePrefix: DEFAULT_ROUTE_PREFIX,
        generatedAt: new Date().toISOString(),
        routes: contexts.map((context) => context.route)
      },
      runtimeConfig: {
        projectName: project.name,
        namespace: project.apiNamespace,
        runtime: {
          host: DEFAULT_RUNTIME_HOST,
          port: DEFAULT_RUNTIME_PORT,
          routePrefix: DEFAULT_ROUTE_PREFIX
        },
        providers: [...providerConfigByRef.values()],
        defaults: {
          maxApiRetries: 3,
          maxRepairRounds: 1
        }
      }
    };

    return {
      preflight,
      contexts,
      artifacts
    };
  }
}
