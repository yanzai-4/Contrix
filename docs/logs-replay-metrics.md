# Logs, Replay, and Metrics

Contrix includes built-in observability for runtime contract execution.

## Call Logs
Each runtime invocation records:
- run/request identifiers
- project/endpoint/provider/model context
- success/failure + error type/stage
- output source and repair/retry indicators
- latency and attempt counts
- prompt hash
- input/output previews
- token usage

## Token and Cache Metrics
Usage normalization tracks:
- `inputTokens`, `outputTokens`, `totalTokens`
- `cachedInputTokens`
- `cacheReadTokens`, `cacheWriteTokens`, `cacheMissTokens`
- `cacheHitObserved`
- `cacheMetricsSupported`
- `cacheMetricsSource` (`official` / `fallback` / `none`)
- raw provider usage payload snapshot

## Replay Debug Snapshots
Replay data helps inspect full execution internals:
- rendered prompt
- provider raw text by attempt
- JSON extraction details
- validation failures
- deterministic repair actions
- retry/fallback behavior

## Metrics APIs
- `GET /metrics/overview`
- `GET /metrics/timeseries?range=...`
- `GET /metrics/breakdown?range=...`

Metrics aggregate by:
- provider
- model
- project
- endpoint

## Logs APIs
- `GET /logs`
- `GET /logs/{id}`
- `GET /logs/{id}/debug`
- `POST /logs/cleanup`

## Silent Mode Note
In silent mode, call log/debug persistence is disabled.  
Use normal mode when you need replay and metrics history.
