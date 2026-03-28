# Runtime Execution Guide

Contrix runtime executes contract-defined endpoints through a stable HTTP interface.

## Route Prefix Behavior
Runtime routes use configured `routePrefix` (default configured value: `/contrix`).

Compatibility behavior:
- If configured prefix is not `/runtime`, Contrix also registers `/runtime` as a temporary legacy alias.
- Route prefix changes require restart to apply.

## Runtime Routes
Using `{prefix}` to represent effective route prefix:

- `POST /{prefix}/{namespace}/{pathSlug}`
- `POST /{prefix}/by-endpoint/{endpointId}`
- `GET /{prefix}/{namespace}/{pathSlug}/meta`
- `GET /{prefix}/{namespace}/{pathSlug}/preflight`
- `GET /{prefix}/by-endpoint/{endpointId}/preflight`
- `POST /{prefix}/by-endpoint/{endpointId}/preview-request`

## Request Payload
```json
{
  "inputText": "for text-mode endpoints",
  "inputJson": { "for": "json-mode endpoints" },
  "overrideModel": "optional-model-override"
}
```

Input rules:
- text mode requires `inputText`
- json mode requires `inputJson` object matching input schema

## Execution Flow
1. Resolve endpoint by route or endpoint id
2. Run preflight (provider/spec/prompt/model/input checks)
3. Render prompt from current prompt snapshot
4. Call provider adapter
5. Validate output schema
6. Apply deterministic repair / repair retry / fallback as needed
7. Return structured runtime response (+ attempts and trace metadata)

## Response Contract (High Level)
Runtime returns a contract response object with `success` flag.

Success response includes:
- endpoint/provider/model/spec/prompt identifiers
- final output (`finalOutputJson`, `finalOutputRawText`)
- `outputSource` (provider direct, repaired, retry, fallback variants)
- attempt traces and normalized usage

Failure response includes:
- normalized error (`type`, `stage`, message, context)
- attempts
- last raw output
- validation issues

Notes:
- Schema/request validation errors return HTTP `400`.
- Runtime route-level failures can be represented as `success: false` payloads.

## Metadata and Preflight
Use metadata/preflight routes to integrate safely before execution:
- `meta`: runtime binding snapshot for endpoint
- `preflight`: readiness checks + issues list
- `preview-request`: rendered prompt + provider payload preview

## Silent Mode (Runtime-only)
Enable at startup:
```bash
pnpm start -- --silent
# or
pnpm dev -- --silent
```

Behavior:
- Web UI disabled (server only)
- Only `/health` and runtime routes are registered
- Control-plane routes are unavailable
- Call log persistence disabled
- Server log level forced to `error`

Silent mode cannot be toggled at runtime.
