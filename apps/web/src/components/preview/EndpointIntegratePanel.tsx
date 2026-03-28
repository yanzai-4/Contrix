import { useEffect, useMemo, useState } from 'react';
import type { EndpointSpecCurrentResponse, EndpointSummary, JsonSchemaObject, RuntimeSettingsResponse } from '@contrix/spec-core';
import { buildRuntimeRoutePreview } from '@contrix/spec-core';
import type { RuntimePreflightResponse } from '@contrix/runtime-core';
import { MonacoReadOnly } from '../common/MonacoReadOnly';
import { fetchRuntimeSettings } from '../../services/api';

type IntegrateLanguage = 'ts' | 'js' | 'python' | 'java' | 'cpp';
type IntegrateSubview = 'code' | 'shape' | 'brief';

interface EndpointIntegratePanelProps {
  endpoint: EndpointSummary;
  specCurrent: EndpointSpecCurrentResponse | null;
  runtimePreflight: RuntimePreflightResponse | null;
}

interface SchemaField {
  key: string;
  variable: string;
  schema: JsonSchemaObject;
  required: boolean;
}

const LANGUAGE_OPTIONS: Array<{ id: IntegrateLanguage; label: string; monacoLanguage: string }> = [
  { id: 'ts', label: 'TypeScript', monacoLanguage: 'typescript' },
  { id: 'js', label: 'JavaScript', monacoLanguage: 'javascript' },
  { id: 'python', label: 'Python', monacoLanguage: 'python' },
  { id: 'java', label: 'Java', monacoLanguage: 'java' },
  { id: 'cpp', label: 'C++', monacoLanguage: 'cpp' }
];

const TOKEN_MAP: Array<[string, string]> = [
  ['国家', 'country'],
  ['名称', 'name'],
  ['名字', 'name'],
  ['名', 'name'],
  ['正式', 'official'],
  ['全面', 'full'],
  ['国旗', 'flag'],
  ['建国', 'founding'],
  ['日期', 'date'],
  ['时间', 'time'],
  ['说明', 'description'],
  ['状态', 'status'],
  ['结果', 'result']
];

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function resolveSchemaType(schema: JsonSchemaObject): 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' {
  if (Array.isArray(schema.type)) {
    const first = schema.type.find((item) => item !== 'null');
    if (
      first === 'object' ||
      first === 'array' ||
      first === 'string' ||
      first === 'number' ||
      first === 'integer' ||
      first === 'boolean'
    ) {
      return first;
    }
  }

  if (
    schema.type === 'object' ||
    schema.type === 'array' ||
    schema.type === 'string' ||
    schema.type === 'number' ||
    schema.type === 'integer' ||
    schema.type === 'boolean'
  ) {
    return schema.type;
  }

  return 'string';
}

function toSampleValue(schema: JsonSchemaObject): unknown {
  if (typeof schema.example !== 'undefined') {
    return schema.example;
  }

  const schemaType = resolveSchemaType(schema);
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  if (schemaType === 'object') {
    const properties = schema.properties ?? {};
    const requiredSet = new Set(schema.required ?? []);
    const result: Record<string, unknown> = {};
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (!propertySchema) {
        continue;
      }

      if (requiredSet.size > 0 && !requiredSet.has(key)) {
        continue;
      }

      result[key] = toSampleValue(propertySchema);
    }
    return result;
  }

  if (schemaType === 'array') {
    if (schema.items) {
      return [toSampleValue(schema.items)];
    }
    return [];
  }

  if (schemaType === 'number') {
    return 1.2;
  }

  if (schemaType === 'integer') {
    return 1;
  }

  if (schemaType === 'boolean') {
    return true;
  }

  return 'string';
}

function toAsciiBaseName(key: string): string {
  let transformed = key;
  for (const [from, to] of TOKEN_MAP) {
    transformed = transformed.split(from).join(` ${to} `);
  }

  const normalized = transformed
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim();

  return normalized;
}

function toCamelCase(value: string): string {
  const parts = value
    .split(' ')
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return '';
  }

  return parts
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (index === 0) {
        return lower;
      }

      return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
    })
    .join('');
}

function buildFieldVariableName(key: string, index: number, used: Set<string>): string {
  const base = toAsciiBaseName(key);
  const camel = toCamelCase(base);
  const initial = camel || `field${index + 1}`;
  const normalized = /^[a-zA-Z_]/.test(initial) ? initial : `field${index + 1}${initial}`;
  let candidate = normalized;
  let counter = 2;

  while (used.has(candidate)) {
    candidate = `${normalized}${counter}`;
    counter += 1;
  }

  used.add(candidate);
  return candidate;
}

function asJsonSchema(value: unknown): JsonSchemaObject | null {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return null;
  }

  return value as JsonSchemaObject;
}

function parseNamespaceFromRoutePreview(routePreview: string, pathSlug: string): string | null {
  const routeSegments = routePreview.trim().replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const pathSegments = pathSlug.trim().split('/').filter(Boolean);
  if (!routeSegments.length || !pathSegments.length) {
    return null;
  }

  const namespaceIndex = routeSegments.length - pathSegments.length - 1;
  if (namespaceIndex < 0) {
    return null;
  }

  return routeSegments[namespaceIndex] ?? null;
}

function buildSchemaFields(schema: JsonSchemaObject | null): SchemaField[] {
  if (!schema || resolveSchemaType(schema) !== 'object') {
    return [];
  }

  const properties = schema.properties ?? {};
  const requiredSet = new Set(schema.required ?? []);
  const used = new Set<string>();

  return Object.entries(properties).map(([key, propertySchema], index) => ({
    key,
    variable: buildFieldVariableName(key, index, used),
    schema: propertySchema,
    required: requiredSet.has(key)
  }));
}

function jsLiteral(value: unknown): string {
  return JSON.stringify(value);
}

function pythonLiteral(value: unknown): string {
  if (value === null) {
    return 'None';
  }

  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => pythonLiteral(item)).join(', ')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, item]) => `${JSON.stringify(key)}: ${pythonLiteral(item)}`
    );
    return `{${entries.join(', ')}}`;
  }

  return 'None';
}

function javaLiteral(value: unknown): string {
  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return JSON.stringify(typeof value === 'string' ? value : 'value');
}

function cppLiteral(value: unknown): string {
  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return JSON.stringify(typeof value === 'string' ? value : 'value');
}

function tsParamType(schema: JsonSchemaObject): string {
  const type = resolveSchemaType(schema);
  if (type === 'number' || type === 'integer') {
    return 'number';
  }
  if (type === 'boolean') {
    return 'boolean';
  }
  if (type === 'array') {
    return 'unknown[]';
  }
  if (type === 'object') {
    return 'Record<string, unknown>';
  }
  return 'string';
}

function pythonParamType(schema: JsonSchemaObject): string {
  const type = resolveSchemaType(schema);
  if (type === 'number') {
    return 'float';
  }
  if (type === 'integer') {
    return 'int';
  }
  if (type === 'boolean') {
    return 'bool';
  }
  if (type === 'array') {
    return 'list';
  }
  if (type === 'object') {
    return 'dict';
  }
  return 'str';
}

function javaParamType(schema: JsonSchemaObject): string {
  const type = resolveSchemaType(schema);
  if (type === 'number') {
    return 'double';
  }
  if (type === 'integer') {
    return 'int';
  }
  if (type === 'boolean') {
    return 'boolean';
  }
  return 'String';
}

function cppParamType(schema: JsonSchemaObject): string {
  const type = resolveSchemaType(schema);
  if (type === 'number') {
    return 'double';
  }
  if (type === 'integer') {
    return 'int';
  }
  if (type === 'boolean') {
    return 'bool';
  }
  return 'const std::string&';
}

function buildJsOrTsCode(params: {
  endpointUrl: string;
  inputMode: 'json' | 'text';
  inputFields: SchemaField[];
  outputFields: SchemaField[];
  typescript: boolean;
}): string {
  const functionArgs =
    params.inputMode === 'json'
      ? params.inputFields
          .map((field) => `${field.variable}${params.typescript ? `: ${tsParamType(field.schema)}` : ''}`)
          .join(', ')
      : `inputText${params.typescript ? ': string' : ''}`;

  const callArgs =
    params.inputMode === 'json'
      ? params.inputFields.map((field) => jsLiteral(toSampleValue(field.schema))).join(', ')
      : jsLiteral('replace with input text');

  const payloadExpression =
    params.inputMode === 'json'
      ? params.inputFields.length > 0
        ? `{
        ${params.inputFields
          .map((field) => `${JSON.stringify(field.key)}: ${field.variable}`)
          .join(',\n        ')}
      }`
        : '{}'
      : '{ inputText }';

  const successReturn =
    params.outputFields.length > 0
      ? `return {
      ${params.outputFields
        .map((field) => `${JSON.stringify(field.key)}: data?.[${JSON.stringify(field.key)}]`)
        .join(',\n      ')}
    };`
      : 'return data;';

  return `async function runEndpoint(${functionArgs})${params.typescript ? ': Promise<Record<string, unknown> | null>' : ''} {
  try {
    const response = await fetch(${JSON.stringify(params.endpointUrl)}, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(${payloadExpression})
    });

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    const data${params.typescript ? ': any' : ''} = await response.json();
    if (data?.isError === true) {
      console.log(data?.reason ?? "Unknown error");
      if (data?.detail) {
        console.log(data.detail);
      }
      return null;
    }

    ${successReturn}
  } catch (error) {
    console.log("Request failed:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

void (async () => {
  const result = await runEndpoint(${callArgs});
  console.log(result);
})();`;
}

function buildPythonCode(params: {
  endpointUrl: string;
  inputMode: 'json' | 'text';
  inputFields: SchemaField[];
  outputFields: SchemaField[];
}): string {
  const functionArgs =
    params.inputMode === 'json'
      ? params.inputFields.map((field) => `${field.variable}: ${pythonParamType(field.schema)}`).join(', ')
      : 'input_text: str';

  const callArgs =
    params.inputMode === 'json'
      ? params.inputFields.map((field) => pythonLiteral(toSampleValue(field.schema))).join(', ')
      : pythonLiteral('replace with input text');

  const payloadExpression =
    params.inputMode === 'json'
      ? params.inputFields.length > 0
        ? `{
            ${params.inputFields
              .map((field) => `${JSON.stringify(field.key)}: ${field.variable}`)
              .join(',\n            ')}
        }`
        : '{}'
      : '{"inputText": input_text}';

  const successReturn =
    params.outputFields.length > 0
      ? `return {
            ${params.outputFields
              .map((field) => `${JSON.stringify(field.key)}: data.get(${JSON.stringify(field.key)})`)
              .join(',\n            ')}
        }`
      : 'return data';

  return `import requests

def run_endpoint(${functionArgs}):
    try:
        response = requests.post(
            ${pythonLiteral(params.endpointUrl)},
            json=${payloadExpression}
        )
        response.raise_for_status()
        data = response.json()

        if data.get("isError"):
            print(data.get("reason", "Unknown error"))
            if data.get("detail"):
                print(data["detail"])
            return None

        ${successReturn}
    except Exception as e:
        print(f"Request failed: {e}")
        return None

result = run_endpoint(${callArgs})
print(result)`;
}

function buildJavaCode(params: {
  endpointUrl: string;
  inputMode: 'json' | 'text';
  inputFields: SchemaField[];
  outputFields: SchemaField[];
}): string {
  const functionArgs =
    params.inputMode === 'json'
      ? params.inputFields.map((field) => `${javaParamType(field.schema)} ${field.variable}`).join(', ')
      : 'String inputText';

  const callArgs =
    params.inputMode === 'json'
      ? params.inputFields.map((field) => javaLiteral(toSampleValue(field.schema))).join(', ')
      : javaLiteral('replace with input text');

  const payloadAssignments =
    params.inputMode === 'json'
      ? params.inputFields.map((field) => `payload.put(${JSON.stringify(field.key)}, ${field.variable});`).join('\n')
      : 'payload.put("inputText", inputText);';

  const successReturn =
    params.outputFields.length > 0
      ? `ObjectNode result = mapper.createObjectNode();
${params.outputFields
  .map((field) => `      result.set(${JSON.stringify(field.key)}, data.path(${JSON.stringify(field.key)}));`)
  .join('\n')}
      return result;`
      : 'return data;';

  return `// Requires Jackson (com.fasterxml.jackson.core:jackson-databind)
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class RuntimeClientExample {
  public static JsonNode runEndpoint(${functionArgs}) {
    ObjectMapper mapper = new ObjectMapper();
    try {
      ObjectNode payload = mapper.createObjectNode();
      ${payloadAssignments}

      HttpRequest request = HttpRequest.newBuilder()
          .uri(URI.create(${JSON.stringify(params.endpointUrl)}))
          .header("Content-Type", "application/json")
          .header("Accept", "application/json")
          .POST(HttpRequest.BodyPublishers.ofString(payload.toString()))
          .build();

      HttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() < 200 || response.statusCode() >= 300) {
        System.out.println("Request failed: HTTP " + response.statusCode());
        return null;
      }

      JsonNode data = mapper.readTree(response.body());
      if (data.path("isError").asBoolean(false)) {
        System.out.println(data.path("reason").asText("Unknown error"));
        if (data.has("detail")) {
          System.out.println(data.path("detail").asText(""));
        }
        return null;
      }

      ${successReturn}
    } catch (Exception e) {
      System.out.println("Request failed: " + e.getMessage());
      return null;
    }
  }

  public static void main(String[] args) {
    JsonNode result = runEndpoint(${callArgs});
    System.out.println(result);
  }
}`;
}

function buildCppCode(params: {
  endpointUrl: string;
  inputMode: 'json' | 'text';
  inputFields: SchemaField[];
  outputFields: SchemaField[];
}): string {
  const functionArgs =
    params.inputMode === 'json'
      ? params.inputFields.map((field) => `${cppParamType(field.schema)} ${field.variable}`).join(', ')
      : 'const std::string& inputText';

  const callArgs =
    params.inputMode === 'json'
      ? params.inputFields.map((field) => cppLiteral(toSampleValue(field.schema))).join(', ')
      : cppLiteral('replace with input text');

  const payloadAssignments =
    params.inputMode === 'json'
      ? params.inputFields.map((field) => `payload[${JSON.stringify(field.key)}] = ${field.variable};`).join('\n')
      : 'payload["inputText"] = inputText;';

  const successReturn =
    params.outputFields.length > 0
      ? `json result = json::object();
${params.outputFields
  .map((field) => `    result[${JSON.stringify(field.key)}] = data.contains(${JSON.stringify(field.key)}) ? data[${JSON.stringify(field.key)}] : nullptr;`)
  .join('\n')}
    return result;`
      : 'return data;';

  return `// Requires cpr + nlohmann/json
#include <cpr/cpr.h>
#include <nlohmann/json.hpp>
#include <iostream>
#include <optional>
#include <string>

using json = nlohmann::json;

std::optional<json> runEndpoint(${functionArgs}) {
  try {
    json payload = json::object();
    ${payloadAssignments}

    cpr::Response response = cpr::Post(
      cpr::Url{${cppLiteral(params.endpointUrl)}},
      cpr::Header{{"Content-Type", "application/json"}, {"Accept", "application/json"}},
      cpr::Body{payload.dump()}
    );

    if (response.error.code != cpr::ErrorCode::OK) {
      std::cout << "Request failed: " << response.error.message << std::endl;
      return std::nullopt;
    }
    if (response.status_code < 200 || response.status_code >= 300) {
      std::cout << "Request failed: HTTP " << response.status_code << std::endl;
      return std::nullopt;
    }

    json data = json::parse(response.text, nullptr, false);
    if (data.is_discarded()) {
      std::cout << "Request failed: invalid JSON response" << std::endl;
      return std::nullopt;
    }
    if (data.value("isError", false)) {
      std::cout << data.value("reason", "Unknown error") << std::endl;
      if (data.contains("detail") && data["detail"].is_string()) {
        std::cout << data["detail"].get<std::string>() << std::endl;
      }
      return std::nullopt;
    }

    ${successReturn}
  } catch (const std::exception& e) {
    std::cout << "Request failed: " << e.what() << std::endl;
    return std::nullopt;
  }
}

int main() {
  auto result = runEndpoint(${callArgs});
  if (result.has_value()) {
    std::cout << result->dump(2) << std::endl;
  }
  return 0;
}`;
}

function toAiBrief(params: {
  language: IntegrateLanguage;
  endpointUrl: string;
  endpointRoute: string;
  inputMode: 'json' | 'text';
  inputExample: unknown;
  outputExample: unknown;
  maxApiRetries: number;
  timeoutMs: number | null;
  outputJsonGuarantee: string;
}): string {
  const languageLabel = LANGUAGE_OPTIONS.find((item) => item.id === params.language)?.label ?? params.language;
  const timeoutLabel = params.timeoutMs === null ? 'not set' : `${params.timeoutMs}ms`;
  const inputModeLabel = params.inputMode === 'json' ? 'yes' : 'no';
  const errorResponseExample = {
    isError: true,
    reason: 'Output validation failed.',
    detail: "The 'id' field must be a string.",
    path: params.endpointRoute,
    timestamp: '2026-03-24 21:51:23'
  };

  return `Help me integrate this endpoint into my existing code.

Endpoint:
POST ${params.endpointUrl}

Request JSON:
${prettyJson(params.inputExample)}

Success Response JSON:
${prettyJson(params.outputExample)}

Error Response JSON:
${prettyJson(errorResponseExample)}

Before writing integration code, first check this endpoint's current settings:
- Retry count: ${params.maxApiRetries}
- Timeout: ${timeoutLabel}
- Input must be JSON: ${inputModeLabel}
- Output guaranteed JSON: ${params.outputJsonGuarantee}

Use those settings to decide how much client-side retry / timeout / parsing logic is still necessary.
Avoid redundant logic if the endpoint already handles it.

Please generate concise ${languageLabel} integration code that:
- integrates into existing business logic (not a standalone demo)
- accepts direct business parameters (not a generic payload object)
- returns only the business fields actually needed on success
- if isError === true, shows reason and optional detail
- avoids unnecessary wrappers, classes, abstractions, or heavy defensive logic
- is beginner-friendly and easy to paste into an existing project.`;
}

async function copyText(text: string): Promise<boolean> {
  if (!navigator.clipboard) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function EndpointIntegratePanel({ endpoint, specCurrent, runtimePreflight }: EndpointIntegratePanelProps) {
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettingsResponse | null>(null);
  const [runtimeSettingsError, setRuntimeSettingsError] = useState<string | null>(null);
  const [runtimeSettingsLoading, setRuntimeSettingsLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<IntegrateLanguage>('python');
  const [subview, setSubview] = useState<IntegrateSubview>('code');
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setRuntimeSettingsLoading(true);
    setRuntimeSettingsError(null);

    void (async () => {
      try {
        const settings = await fetchRuntimeSettings();
        if (!mounted) {
          return;
        }

        setRuntimeSettings(settings);
      } catch (error) {
        if (!mounted) {
          return;
        }

        setRuntimeSettingsError(error instanceof Error ? error.message : 'Failed to load runtime settings.');
      } finally {
        if (mounted) {
          setRuntimeSettingsLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const inputMode: 'json' | 'text' =
    runtimePreflight?.inputMode === 'text' ? 'text' : 'json';
  const inputSchema = asJsonSchema(specCurrent?.currentEffectiveSpec.input.schema ?? null);
  const outputSchema = asJsonSchema(specCurrent?.currentEffectiveSpec.output.schema ?? null);
  const inputFields = buildSchemaFields(inputMode === 'json' ? inputSchema : null);
  const outputFields = buildSchemaFields(outputSchema);
  const namespace =
    runtimePreflight?.namespace ??
    parseNamespaceFromRoutePreview(endpoint.routePreview, endpoint.pathSlug) ??
    'namespace';
  const routePrefix = runtimeSettings?.effective.routePrefix ?? '/runtime';
  const endpointRoute = buildRuntimeRoutePreview(namespace, endpoint.pathSlug, routePrefix);
  const baseUrl = runtimeSettings?.effective.baseUrl ?? 'http://localhost:4411';
  const fullUrl = `${baseUrl}${endpointRoute}`;

  const requestJsonExample = useMemo(() => {
    if (inputMode === 'text') {
      return { inputText: 'replace with input text' };
    }

    if (inputSchema) {
      return toSampleValue(inputSchema);
    }

    return { key: 'value' };
  }, [inputMode, inputSchema]);

  const outputShapeExample = useMemo(() => {
    if (outputSchema) {
      return toSampleValue(outputSchema);
    }

    return {
      result: 'value'
    };
  }, [outputSchema]);

  const outputJsonGuarantee = useMemo(() => {
    if (!outputSchema) {
      return 'verify in endpoint settings';
    }

    const outputType = resolveSchemaType(outputSchema);
    if (
      outputType === 'object' ||
      outputType === 'array' ||
      outputType === 'string' ||
      outputType === 'number' ||
      outputType === 'integer' ||
      outputType === 'boolean'
    ) {
      return 'yes (based on current output contract)';
    }

    return 'verify in endpoint settings';
  }, [outputSchema]);

  const generatedCode = useMemo(() => {
    if (selectedLanguage === 'python') {
      return buildPythonCode({
        endpointUrl: fullUrl,
        inputMode,
        inputFields,
        outputFields
      });
    }

    if (selectedLanguage === 'java') {
      return buildJavaCode({
        endpointUrl: fullUrl,
        inputMode,
        inputFields,
        outputFields
      });
    }

    if (selectedLanguage === 'cpp') {
      return buildCppCode({
        endpointUrl: fullUrl,
        inputMode,
        inputFields,
        outputFields
      });
    }

    return buildJsOrTsCode({
      endpointUrl: fullUrl,
      inputMode,
      inputFields,
      outputFields,
      typescript: selectedLanguage === 'ts'
    });
  }, [fullUrl, inputMode, inputFields, outputFields, selectedLanguage]);

  const aiBrief = useMemo(
    () =>
      toAiBrief({
        language: selectedLanguage,
        endpointUrl: fullUrl,
        endpointRoute,
        inputMode,
        inputExample: requestJsonExample,
        outputExample: outputShapeExample,
        maxApiRetries: endpoint.maxApiRetries,
        timeoutMs: endpoint.timeoutMs,
        outputJsonGuarantee
      }),
    [endpoint.maxApiRetries, endpoint.timeoutMs, endpointRoute, fullUrl, inputMode, outputJsonGuarantee, requestJsonExample, outputShapeExample, selectedLanguage]
  );

  const monacoLanguage = LANGUAGE_OPTIONS.find((item) => item.id === selectedLanguage)?.monacoLanguage ?? 'typescript';

  return (
    <section className="preview-panel-stack">
      <section className="panel compact-panel">
        <h3>Integrate: {endpoint.name}</h3>
        <p className="meta-line">
          Endpoint is callable immediately once created. No publish step is required for local runtime calls.
        </p>
        <div className="prompt-meta-row">
          <span className="meta-pill">Endpoint: {endpoint.name}</span>
          <span className="meta-pill">
            Local URL: <code>{fullUrl}</code>
          </span>
          <span className="meta-pill">Method: POST</span>
          <span className="meta-pill">Input Mode: {inputMode.toUpperCase()}</span>
        </div>
        {runtimeSettingsLoading ? <p className="meta-line">Loading runtime settings...</p> : null}
        {runtimeSettingsError ? <p className="error-line">{runtimeSettingsError}</p> : null}
      </section>

      <section className="panel compact-panel">
        <div className="preview-tab-row integrate-tab-row" role="tablist" aria-label="Integrate views">
          <button
            type="button"
            className={`preview-tab-btn ${subview === 'code' ? 'active' : ''}`}
            role="tab"
            aria-selected={subview === 'code'}
            onClick={() => setSubview('code')}
          >
            Code Example
          </button>
          <button
            type="button"
            className={`preview-tab-btn ${subview === 'shape' ? 'active' : ''}`}
            role="tab"
            aria-selected={subview === 'shape'}
            onClick={() => setSubview('shape')}
          >
            Request / Response Shape
          </button>
          <button
            type="button"
            className={`preview-tab-btn ${subview === 'brief' ? 'active' : ''}`}
            role="tab"
            aria-selected={subview === 'brief'}
            onClick={() => setSubview('brief')}
          >
            Endpoint Integration Prompt (for vibe coding)
          </button>
        </div>
      </section>

      {subview === 'code' ? (
        <section className="panel compact-panel">
          <div className="integrate-code-controls">
            <label>
              <span className="integrate-language-label">Language</span>
              <select value={selectedLanguage} onChange={(event) => setSelectedLanguage(event.target.value as IntegrateLanguage)}>
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  const ok = await copyText(generatedCode);
                  setCopyNotice(ok ? 'Code copied.' : 'Copy failed. Clipboard permission is required.');
                })();
              }}
            >
              Copy Code
            </button>
          </div>
          {copyNotice ? <p className="meta-line">{copyNotice}</p> : null}

          <MonacoReadOnly value={generatedCode} language={monacoLanguage} height={460} disableInnerScroll />
        </section>
      ) : null}

      {subview === 'shape' ? (
        <section className="panel compact-panel">
          <h3>Request JSON Example</h3>
          <pre className="json-preview">{prettyJson(requestJsonExample)}</pre>
          <h3>Response JSON Example</h3>
          <pre className="json-preview">{prettyJson(outputShapeExample)}</pre>
        </section>
      ) : null}

      {subview === 'brief' ? (
        <section className="panel compact-panel">
          <div className="row-actions integrate-brief-actions">
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  const ok = await copyText(aiBrief);
                  setCopyNotice(ok ? 'Endpoint integration prompt copied.' : 'Copy failed. Clipboard permission is required.');
                })();
              }}
            >
              Copy Endpoint Integration Prompt
            </button>
          </div>
          {copyNotice ? <p className="meta-line">{copyNotice}</p> : null}
          <MonacoReadOnly value={aiBrief} language="markdown" height={360} disableInnerScroll />
        </section>
      ) : null}
    </section>
  );
}
