# Installation Guide

## Requirements
- Node.js `>=20.19 <25` (recommended: Node.js 20 LTS)
- pnpm `10.16+` (project uses pnpm `10.18.0`)
- Optional desktop shell: Rust + Tauri prerequisites

## Install
```bash
git clone git@github.com:yanzai-4/Contrix.git
cd Contrix
pnpm install
```

## Run (recommended local runtime)
```bash
pnpm build
pnpm start
```

Default local endpoints:
- Web UI: `http://localhost:4400`
- Server API: `http://localhost:4411`

## Development Mode
```bash
pnpm dev
```

Use this for hot-reload development of web + server.

## Silent Mode (runtime-only)
```bash
pnpm start -- --silent
# or
pnpm dev -- --silent
```

Silent mode behavior:
- Starts server only (no web UI process)
- Registers only `/health` and runtime routes
- Disables control-plane routes (`/projects`, `/providers`, `/logs`, `/metrics`, `/settings/runtime`, `/export`, etc.)
- Disables call-log/debug persistence
- Forces server log level to `error`

Important: Silent mode is startup-only. You cannot toggle it while process is running.

## Required Provider Secret
Provider keys are encrypted at rest. `CONTRIX_PROVIDER_SECRET` is required at startup.
If this variable is missing or empty, server startup fails fast.

PowerShell:
```powershell
$env:CONTRIX_PROVIDER_SECRET = "replace-with-your-local-secret"
```

Bash:
```bash
export CONTRIX_PROVIDER_SECRET="replace-with-your-local-secret"
```

## CORS Security Defaults
By default, Contrix allows browser origins from local hosts only:
- `http://localhost:*`
- `http://127.0.0.1:*`
- `http://[::1]:*`

No `Origin` requests (for example CLI tools) are allowed by default.

You can override CORS behavior with:
- `CONTRIX_CORS_MODE=allow-all`
- `CONTRIX_CORS_MODE=allowlist` and `CONTRIX_CORS_ALLOWLIST=https://your-ui.example.com,https://admin.example.com`
