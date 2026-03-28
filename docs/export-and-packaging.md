# Export and Packaging Guide

Contrix can package project endpoints into portable runtime artifacts for non-GUI integration.

## Export APIs
- `GET /export/projects/{projectId}/preflight`
- `POST /export/projects/{projectId}`

## Preflight Requirements
An endpoint is export-ready only when:
- provider binding exists
- current spec is available
- current prompt snapshot exists and matches current spec
- runtime state is consistent

Preflight returns:
- ready endpoints
- skipped endpoints with reasons
- warnings
- blocking issues

## Core Export Artifacts
- `spec.json`
- `router.json`
- `runtime.config.json`
- generated `README.md`

Optional artifacts:
- `runtime-shared.js`
- `runtime.js` (standalone runtime entry)
- `runtime-embed.js` (embeddable helper)
- `examples/*`
- `docs/contract.openapi.json`
- `docs/endpoints.json`
- `package.json` for standalone runtime dependencies

## Security Model
- API keys are never exported.
- Sensitive provider headers are stripped.
- Runtime credentials are mapped to environment variables in `runtime.config.json`.

## Runtime Behavior in Export Bundle
- Standalone runtime loads exported spec/router/config files.
- Request contract remains `POST /{routePrefix}/{namespace}/{pathSlug}`.
- Exported runtime config currently defaults route prefix to `/runtime` in bundle artifacts.

## Standalone Runtime Quick Run
```bash
cd <export-dir>
pnpm install
node runtime.js
```

Then verify:
- `GET /health`
- `POST /runtime/{namespace}/{pathSlug}` (or configured route in exported runtime config)
