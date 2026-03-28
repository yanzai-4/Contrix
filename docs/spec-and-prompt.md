# Spec and Prompt Pipeline

Contrix separates interface definition from runtime execution through a spec/prompt lifecycle.

## Pipeline
1. Project/group/endpoint/schema source state
2. Spec generation (versioned + hashed)
3. Prompt compilation from effective spec
4. Prompt snapshot activation in runtime state

## Spec Model
Each spec captures:
- source snapshot (project/group/endpoint/schema/provider)
- normalized instruction layers
- validation/strictness/repair policies
- structured output strategy
- contract summaries + metadata

Spec state is tracked with:
- endpoint `spec_status`: `missing` | `current` | `stale`
- version history
- diff/export support

## Prompt Model
Prompt compiler produces:
- deterministic prompt template
- section blocks
- prompt hash
- per-spec prompt snapshot

Prompt runtime state tracks:
- `prompt_status`: `missing` | `current` | `stale` | `compile_error`
- last compile timestamp
- compile error message (if any)

## Auto-Sync and Readiness
After contract changes:
- endpoint is marked `stale`
- spec/prompt refresh path is triggered
- runtime readiness is recomputed via preflight

Readiness outcomes:
- `ready`: spec + prompt + provider + model + input mode are all valid
- `not_ready`: blocking issue exists
- `degraded`: non-blocking issues remain

## Useful APIs
### Spec
- `GET /endpoints/{id}/spec`
- `POST /endpoints/{id}/spec/regenerate`
- `GET /endpoints/{id}/spec/versions`
- `GET /endpoints/{id}/spec/versions/{version}`
- `GET /endpoints/{id}/spec/diff?from={v}&to={v}`
- `GET /endpoints/{id}/spec/export?version={v}`

### Prompt
- `GET /prompt/{endpointId}/preview`
- `GET /endpoints/{id}/prompt/state`
- `POST /endpoints/{id}/prompt/compile`
- `POST /prompt/{endpointId}/render`
