# Provider Setup

Contrix provider configuration is managed through the control plane (`Settings -> Provider Settings`).

## Supported Provider Types
- `openai`
- `anthropic`
- `openrouter`
- `openai-compatible`
- `custom`

## Provider Configuration Model
Each provider record defines:
- Name and type
- Base URL (required for `openai-compatible` and `custom`)
- API key
- Default model
- Timeout
- Optional headers
- Notes
- `supportsStructuredOutput` capability flag

## Security and Key Handling
- API keys are encrypted at rest in local SQLite storage.
- List views show masked keys only.
- Runtime decrypts keys only when sending provider requests.
- Export artifacts do **not** include provider secrets.
- `CONTRIX_PROVIDER_SECRET` is required. Server startup fails if it is missing.

Migration note: after upgrading to this security model, set `CONTRIX_PROVIDER_SECRET` before launching Contrix.

## Connection Test
Use `Test Connection` per provider to validate:
- API key presence
- Base URL validity
- network reachability
- provider response latency/status

## Runtime Resolution Rules
- Endpoint provider is resolved by `providerId`.
- Model is resolved in priority order:
  `overrideModel` -> `endpoint.model` -> `provider.defaultModel`.
- Missing key/base/model leads to preflight `not_ready`.

## Important Policy Notes
- Legacy environment-driven provider definitions are not the primary control path.
- Configure providers in Contrix UI to keep runtime and control plane state consistent.
