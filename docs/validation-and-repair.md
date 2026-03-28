# Validation and Repair Guide

Contrix enforces output contracts at runtime, then repairs or retries when output is invalid.

## Runtime Validation Path
1. Parse provider response text
2. Extract JSON candidate
3. Validate against endpoint output schema (Ajv)
4. If invalid, run deterministic repair (when enabled)
5. If still invalid, run repair retry flow (bounded)
6. If configured, return fallback response

## Deterministic Repair
Built-in repair actions include:
- markdown fence stripping
- smart quote normalization
- trailing comma cleanup
- bracket balancing
- JSON substring extraction
- field-name normalization against schema
- limited type coercion using schema types

Deterministic repair runs before issuing another provider call.

## Repair Retry
When enabled by endpoint policy:
- Contrix sends a repair-oriented retry prompt
- retries are bounded by runtime policy
- max provider calls are capped defensively

## Fallback Modes
Endpoint fallback supports:
- `auto_json`
- `auto_text`
- `manual` (manual JSON/text payload)

Fallback responses include `fallbackMeta` with source error context.

## Output Source Semantics
`outputSource` indicates where final output came from:
- `provider_direct_valid`
- `deterministic_repair`
- `repair_retry_valid`
- `repair_retry_deterministic_repair`
- `fallback_auto_text`
- `fallback_auto_json`
- `fallback_manual_text`
- `fallback_manual_json`

## Response Trace Fields
Runtime response attempt traces include:
- extraction method and parse confidence
- validation issues
- deterministic repair actions/results
- retry decisions and success/error stage
- per-attempt latency and provider request summary

Use replay + logs pages to inspect these traces after execution.
