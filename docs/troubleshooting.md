# Troubleshooting

## `pnpm` not found
Use Corepack:
```bash
corepack enable
corepack pnpm install
```

## Runtime route returns 404
Check effective route prefix in `Settings -> Route Setting`.

Default configured prefix is `/contrix`.  
If you call `/runtime/...`, it works only while legacy alias is active.

## Runtime preflight is `not_ready`
Common causes:
- provider key missing
- model unresolved (`overrideModel` / `endpoint.model` / `provider.defaultModel`)
- current spec missing/stale
- current prompt missing/stale/compile_error
- input mode/schema mismatch

Use:
- `GET /{prefix}/{namespace}/{pathSlug}/preflight`
- `GET /{prefix}/by-endpoint/{endpointId}/preflight`

## Request rejected for input mismatch
- Text endpoint requires `inputText`
- JSON endpoint requires `inputJson` object matching input schema

Use `POST /{prefix}/by-endpoint/{endpointId}/preview-request` to inspect rendered prompt and adapter payload.

## Provider test fails
Check:
- API key
- base URL
- outbound network
- provider-specific headers/timeouts

## No logs or replay data
If running with `--silent`, logs/replay persistence is disabled by design.

## Export preflight fails
Resolve endpoint-level issues:
- ensure current spec exists
- ensure prompt snapshot is current and matches spec version
- ensure provider/model binding is valid

Then run preflight again before export execution.
