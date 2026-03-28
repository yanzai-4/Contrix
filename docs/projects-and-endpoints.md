# Projects, Groups, Endpoints

Contrix organizes AI interfaces as:
- **Project**: top-level namespace + base instruction scope
- **Group**: optional instruction layer inside a project
- **Endpoint**: executable contract exposed as runtime API

## Project
Project defines:
- `apiNamespace` (runtime path namespace)
- optional base instruction
- optional default provider binding

Project updates mark child endpoints `stale` and trigger auto-sync attempts.

## Group
Group provides:
- optional `groupInstruction`
- logical organization inside a project

Group updates also mark member endpoints `stale` and trigger auto-sync.

## Endpoint
Endpoint defines:
- provider + model binding
- endpoint instruction/description/rules/examples/tone/fallback
- runtime policy (`timeoutMs`, `maxApiRetries`, `maxRepairRounds`, `temperature`, `topP`)
- input mode (`text` or `json`)
- input/output schemas

## Runtime Route Shape
Runtime route contract:
- `POST /{routePrefix}/{apiNamespace}/{pathSlug}`
- `POST /{routePrefix}/by-endpoint/{endpointId}`

Default configured route prefix is `/contrix`.  
`/runtime` is currently available as a compatibility alias when prefix is not `/runtime`.

## Auto-Sync Lifecycle
When endpoint/project/group/schema changes:
1. Endpoint `spec_status` is marked `stale`
2. Spec regeneration occurs on demand
3. Prompt preview/compile auto-sync attempts to refresh runtime artifacts
4. Runtime preflight reflects readiness (`ready` / `not_ready` / `degraded`)

This keeps endpoint contract state and runtime state aligned without manual multi-step orchestration.
