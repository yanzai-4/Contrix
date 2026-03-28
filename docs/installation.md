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

## Optional Provider Secret
Provider keys are encrypted at rest. You can set your own encryption secret:

PowerShell:
```powershell
$env:CONTRIX_PROVIDER_SECRET = "replace-with-your-local-secret"
```

Bash:
```bash
export CONTRIX_PROVIDER_SECRET="replace-with-your-local-secret"
```
