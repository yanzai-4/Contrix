import type { MigrationDefinition } from '../types.js';

export const baselineMigration: MigrationDefinition = {
  id: '001_baseline',
  description: 'Baseline schema for current development runtime/storage model.',
  sql: `
    CREATE TABLE app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('openai', 'anthropic', 'openrouter', 'openai-compatible', 'custom')),
      base_url TEXT,
      api_key_encrypted TEXT NOT NULL,
      default_model TEXT NOT NULL,
      supports_structured_output INTEGER NOT NULL DEFAULT 0,
      timeout_ms INTEGER NOT NULL DEFAULT 30000,
      headers_json TEXT NOT NULL DEFAULT '{}',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX idx_providers_name_unique
      ON providers(name COLLATE NOCASE);

    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      base_instruction TEXT,
      default_provider_id TEXT,
      api_namespace TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX idx_projects_name_unique
      ON projects(name COLLATE NOCASE);

    CREATE UNIQUE INDEX idx_projects_api_namespace_unique
      ON projects(api_namespace COLLATE NOCASE);

    CREATE TABLE groups (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      group_instruction TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_groups_project_id
      ON groups(project_id);

    CREATE UNIQUE INDEX idx_groups_project_name_unique
      ON groups(project_id, name COLLATE NOCASE);

    CREATE TABLE endpoints (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      group_id TEXT,
      provider_id TEXT,
      name TEXT NOT NULL,
      path_slug TEXT NOT NULL,
      model TEXT,
      endpoint_instruction TEXT,
      description TEXT,
      constraints_text TEXT,
      examples_text TEXT,
      tone TEXT,
      fallback_text TEXT,
      validation_text TEXT,
      timeout_ms INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      input_mode TEXT NOT NULL DEFAULT 'text',
      input_schema TEXT,
      output_schema TEXT,
      schema_updated_at TEXT,
      enable_structured_output INTEGER NOT NULL DEFAULT 0,
      enable_deterministic_repair INTEGER NOT NULL DEFAULT 0,
      max_api_retries INTEGER NOT NULL DEFAULT 0,
      max_repair_rounds INTEGER NOT NULL DEFAULT 0,
      temperature REAL,
      top_p REAL,
      spec_status TEXT NOT NULL DEFAULT 'missing',
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE SET NULL
    );

    CREATE INDEX idx_endpoints_project_id
      ON endpoints(project_id);

    CREATE INDEX idx_endpoints_group_id
      ON endpoints(group_id);

    CREATE INDEX idx_endpoints_provider_id
      ON endpoints(provider_id);

    CREATE UNIQUE INDEX idx_endpoints_project_slug_unique
      ON endpoints(project_id, path_slug COLLATE NOCASE);

    CREATE TABLE endpoint_specs (
      endpoint_id TEXT PRIMARY KEY,
      current_version INTEGER NOT NULL DEFAULT 0,
      current_hash TEXT,
      last_generated_at TEXT,
      updated_at TEXT NOT NULL,
      pending_trigger_reason TEXT NOT NULL DEFAULT 'initial',
      FOREIGN KEY(endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
    );

    CREATE TABLE endpoint_spec_versions (
      id TEXT PRIMARY KEY,
      endpoint_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      spec_json TEXT NOT NULL,
      hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      trigger_reason TEXT NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX idx_endpoint_spec_versions_endpoint_version
      ON endpoint_spec_versions(endpoint_id, version);

    CREATE INDEX idx_endpoint_spec_versions_current
      ON endpoint_spec_versions(endpoint_id, is_current, version DESC);

    CREATE INDEX idx_endpoint_spec_versions_created
      ON endpoint_spec_versions(endpoint_id, created_at DESC);

    CREATE TABLE prompt_snapshots (
      id TEXT PRIMARY KEY,
      spec_id TEXT NOT NULL,
      spec_version INTEGER NOT NULL,
      prompt_hash TEXT NOT NULL,
      prompt_text TEXT NOT NULL,
      sections_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX idx_prompt_snapshots_spec_version
      ON prompt_snapshots(spec_id, spec_version);

    CREATE INDEX idx_prompt_snapshots_hash
      ON prompt_snapshots(prompt_hash);

    CREATE TABLE endpoint_runtime_state (
      endpoint_id TEXT PRIMARY KEY,
      current_spec_id TEXT,
      current_spec_version INTEGER,
      spec_status TEXT NOT NULL DEFAULT 'missing',
      current_prompt_snapshot_id TEXT,
      current_prompt_hash TEXT,
      prompt_status TEXT NOT NULL DEFAULT 'missing',
      last_prompt_compiled_at TEXT,
      last_prompt_compile_error TEXT,
      runtime_readiness TEXT NOT NULL DEFAULT 'not_ready',
      last_runtime_checked_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE,
      FOREIGN KEY(current_prompt_snapshot_id) REFERENCES prompt_snapshots(id) ON DELETE SET NULL
    );

    CREATE TABLE prompt_compile_runs (
      id TEXT PRIMARY KEY,
      endpoint_id TEXT NOT NULL,
      spec_id TEXT,
      spec_version INTEGER,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      error_message TEXT,
      prompt_snapshot_id TEXT,
      prompt_hash TEXT,
      trigger_reason TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL,
      FOREIGN KEY(endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE,
      FOREIGN KEY(prompt_snapshot_id) REFERENCES prompt_snapshots(id) ON DELETE SET NULL
    );

    CREATE INDEX idx_prompt_compile_runs_endpoint_created
      ON prompt_compile_runs(endpoint_id, created_at DESC);

    CREATE TABLE call_logs (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      project_key TEXT,
      project_name TEXT,
      endpoint_key TEXT,
      endpoint_name TEXT,
      provider_key TEXT,
      provider_label TEXT,
      model TEXT,
      success INTEGER NOT NULL DEFAULT 0,
      output_source TEXT,
      structured_output_triggered INTEGER NOT NULL DEFAULT 0,
      repair_triggered INTEGER NOT NULL DEFAULT 0,
      api_call_count INTEGER NOT NULL DEFAULT 0,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      repair_count INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      total_tokens INTEGER,
      cached_tokens INTEGER,
      error_type TEXT,
      failure_stage TEXT,
      prompt_hash TEXT,
      input_preview TEXT,
      output_preview TEXT,
      has_debug_snapshot INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      cache_read_tokens INTEGER,
      cache_write_tokens INTEGER,
      cache_miss_tokens INTEGER,
      cache_hit_observed INTEGER,
      cache_metrics_supported INTEGER,
      cache_metrics_source TEXT,
      raw_usage_json TEXT
    );

    CREATE INDEX idx_call_logs_run_id
      ON call_logs(run_id);

    CREATE INDEX idx_call_logs_created_at
      ON call_logs(created_at DESC);

    CREATE INDEX idx_call_logs_success_created
      ON call_logs(success, created_at DESC);

    CREATE INDEX idx_call_logs_project_created
      ON call_logs(project_name, created_at DESC);

    CREATE INDEX idx_call_logs_endpoint_created
      ON call_logs(endpoint_name, created_at DESC);

    CREATE INDEX idx_call_logs_provider_created
      ON call_logs(provider_label, created_at DESC);

    CREATE TABLE call_log_debug_snapshots (
      id TEXT PRIMARY KEY,
      call_log_id TEXT NOT NULL UNIQUE,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(call_log_id) REFERENCES call_logs(id) ON DELETE CASCADE
    );

    CREATE TABLE runtime_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      port INTEGER NOT NULL DEFAULT 4411,
      route_prefix TEXT NOT NULL DEFAULT '/contrix',
      log_level TEXT NOT NULL DEFAULT 'info',
      updated_at TEXT NOT NULL
    );
  `
};
