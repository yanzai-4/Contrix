import { useEffect, useMemo, useState } from 'react';
import type {
  RuntimeLogLevel,
  RuntimeSettingsConfigured,
  RuntimeSettingsResponse
} from '@contrix/spec-core';
import { ProviderList } from '../components/providers/ProviderList';
import { fetchRuntimeSettings, updateRuntimeSettings } from '../services/api';
import { useProviderStore } from '../store/useProviderStore';
import { useI18n, type UiLanguage } from '../i18n';

export type SettingsTab = 'general' | 'runtime' | 'providers';
const RUNTIME_BASE_URL_STORAGE_KEY = 'contrix.runtime.baseUrl';

interface SettingsPageProps {
  initialTab: SettingsTab;
  onChangeTab: (tab: SettingsTab) => void;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to update route setting.';
}

function hasFieldOverride(settings: RuntimeSettingsResponse | null): boolean {
  if (!settings) {
    return false;
  }

  return Object.values(settings.sourceByField).some(
    (source) => source !== 'config' && source !== 'default'
  );
}

function hasUnsavedChanges(
  draft: RuntimeSettingsConfigured | null,
  settings: RuntimeSettingsResponse | null
): boolean {
  if (!draft || !settings) {
    return false;
  }

  return JSON.stringify(draft) !== JSON.stringify(settings.configured);
}

export function SettingsPage({ initialTab, onChangeTab }: SettingsPageProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettingsResponse | null>(null);
  const [runtimeDraft, setRuntimeDraft] = useState<RuntimeSettingsConfigured | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeSaving, setRuntimeSaving] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [runtimeNotice, setRuntimeNotice] = useState<string | null>(null);
  const loadProviders = useProviderStore((state) => state.loadProviders);
  const { language, setLanguage, t } = useI18n();

  const loadRuntime = async () => {
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const response = await fetchRuntimeSettings();
      setRuntimeSettings(response);
      setRuntimeDraft(response.configured);
      try {
        window.localStorage.setItem(RUNTIME_BASE_URL_STORAGE_KEY, response.effective.baseUrl);
      } catch {
        // Ignore storage write failures.
      }
    } catch (error) {
      setRuntimeError(toErrorMessage(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (tab === 'providers') {
      void loadProviders();
      return;
    }

    if ((tab === 'general' || tab === 'runtime') && !runtimeSettings && !runtimeLoading) {
      void loadRuntime();
    }
  }, [tab, loadProviders, runtimeLoading, runtimeSettings]);

  const selectTab = (nextTab: SettingsTab) => {
    setTab(nextTab);
    onChangeTab(nextTab);
  };

  const updateLanguage = (value: string) => {
    const nextLanguage: UiLanguage = value === 'zh' ? 'zh' : 'en';
    setLanguage(nextLanguage);
  };

  const saveRuntime = async () => {
    if (!runtimeDraft) {
      return;
    }

    setRuntimeSaving(true);
    setRuntimeError(null);
    setRuntimeNotice(null);

    try {
      const response = await updateRuntimeSettings(runtimeDraft);
      setRuntimeSettings(response);
      setRuntimeDraft(response.configured);
      try {
        window.localStorage.setItem(RUNTIME_BASE_URL_STORAGE_KEY, response.effective.baseUrl);
      } catch {
        // Ignore storage write failures.
      }
      setRuntimeNotice(
        'Saved. Restart the local service to apply port or route prefix changes.'
      );
    } catch (error) {
      setRuntimeError(toErrorMessage(error));
    } finally {
      setRuntimeSaving(false);
    }
  };

  const handleConsoleLogLevelChange = async (value: RuntimeLogLevel) => {
    const previousLogLevel = runtimeDraft?.logLevel ?? runtimeSettings?.configured.logLevel ?? 'info';

    setRuntimeDraft((previous) =>
      previous
        ? {
            ...previous,
            logLevel: value
          }
        : previous
    );

    setRuntimeSaving(true);
    setRuntimeError(null);
    setRuntimeNotice(null);

    try {
      const response = await updateRuntimeSettings({ logLevel: value });
      setRuntimeSettings(response);
      setRuntimeDraft((previous) =>
        previous
          ? {
              ...previous,
              logLevel: response.configured.logLevel
            }
          : response.configured
      );
      setRuntimeNotice('Server console log level saved. Restart the local service to apply the change.');
    } catch (error) {
      setRuntimeError(toErrorMessage(error));
      setRuntimeDraft((previous) =>
        previous
          ? {
              ...previous,
              logLevel: previousLogLevel
            }
          : previous
      );
    } finally {
      setRuntimeSaving(false);
    }
  };

  const runtimeHasOverrides = useMemo(() => hasFieldOverride(runtimeSettings), [runtimeSettings]);
  const runtimeHasUnsaved = useMemo(
    () => hasUnsavedChanges(runtimeDraft, runtimeSettings),
    [runtimeDraft, runtimeSettings]
  );

  return (
    <section className="settings-layout">
      <aside className="panel settings-sidebar">
        <h2>{t('Settings')}</h2>
        <button
          type="button"
          className={tab === 'providers' ? 'settings-nav-btn active' : 'settings-nav-btn'}
          onClick={() => selectTab('providers')}
        >
          {t('Provider Settings')}
        </button>
        <button
          type="button"
          className={tab === 'general' ? 'settings-nav-btn active' : 'settings-nav-btn'}
          onClick={() => selectTab('general')}
        >
          {t('General Settings')}
        </button>
        <button
          type="button"
          className={tab === 'runtime' ? 'settings-nav-btn active' : 'settings-nav-btn'}
          onClick={() => selectTab('runtime')}
        >
          Route Setting
        </button>
      </aside>

      <section className="settings-content">
        {tab === 'general' ? (
          <section className="panel">
            <h2>{t('General Settings')}</h2>
            <div className="settings-group-stack">
              <section className="settings-group-card">
                <h3>Interface Language</h3>
                <p className="meta-line">
                  {t('Language preference is stored locally and applied automatically on next launch.')}
                </p>
                <label className="settings-field">
                  <span>{t('Display Language')}</span>
                  <select value={language} onChange={(event) => updateLanguage(event.target.value)}>
                    <option value="en">{t('English')}</option>
                    <option value="zh">{t('Chinese')}</option>
                  </select>
                </label>
              </section>

              <section className="settings-group-card">
                <h3>Server Console Logs</h3>
                <p className="meta-line">
                  Controls local server terminal/console output only. Changes save automatically and apply after restart.
                </p>

                {runtimeError ? <p className="error-line">{runtimeError}</p> : null}
                {runtimeNotice ? <p className="success-line">{runtimeNotice}</p> : null}

                {!runtimeDraft || !runtimeSettings ? (
                  <p className="meta-line">Loading console log settings...</p>
                ) : (
                  <label className="settings-field">
                    <span>Log Level</span>
                    <select
                      value={runtimeDraft.logLevel}
                      onChange={(event) => void handleConsoleLogLevelChange(event.target.value as RuntimeLogLevel)}
                      disabled={runtimeLoading || runtimeSaving}
                    >
                      <option value="debug">debug</option>
                      <option value="info">info</option>
                      <option value="warn">warn</option>
                      <option value="error">error</option>
                    </select>
                  </label>
                )}
              </section>

              <section className="settings-group-card">
                <h3>Silent Mode (Runtime-only)</h3>
                <p className="meta-line">
                  Enable or disable Silent Mode only before startup using command flags.
                </p>
                <div className="silent-mode-command-card">
                  <div className="silent-mode-command-head">
                    <span className="silent-mode-command-kicker">Startup Flags</span>
                    <span className="silent-mode-command-badge">Pre-boot only</span>
                  </div>

                  <div className="silent-mode-command-grid">
                    <p className="silent-mode-command-line">
                      <span className="silent-mode-command-label">Enable</span>
                      <span className="silent-mode-command-values">
                        <code>pnpm start -- --silent</code>
                        <span className="silent-mode-command-join">or</span>
                        <code>pnpm dev -- --silent</code>
                      </span>
                    </p>
                    <p className="silent-mode-command-line">
                      <span className="silent-mode-command-label">Disable</span>
                      <span className="silent-mode-command-values">
                        remove <code>--silent</code> from the startup command.
                      </span>
                    </p>
                  </div>

                  <div className="silent-mode-command-divider" />
                  <p className="silent-mode-command-note">
                    Silent Mode keeps only runtime tool routes (plus health) and disables control panel APIs, call log
                    persistence, and token persistence.
                  </p>
                  <p className="silent-mode-ui-warning">Silent Mode will disable the frontend Web UI.</p>
                  <p className="silent-mode-command-footnote">
                    Runtime mode is fixed at process startup and cannot be switched while the project is running.
                  </p>
                </div>
              </section>
            </div>
          </section>
        ) : null}

        {tab === 'runtime' ? (
          <section className="panel">
            <div className="panel-header-row">
              <div>
                <h2>Route Setting</h2>
                <p className="meta-line runtime-settings-note">
                  Restart required after saving port or route prefix changes.
                </p>
              </div>
              <div className="row-actions">
                <button type="button" onClick={() => void saveRuntime()} disabled={runtimeSaving || runtimeLoading || !runtimeHasUnsaved}>
                  {runtimeSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            {runtimeHasOverrides ? (
              <p className="warning-line">
                One or more fields are currently overridden by environment variables. Effective values may differ from configured values.
              </p>
            ) : null}

            {runtimeError ? <p className="error-line">{runtimeError}</p> : null}
            {runtimeNotice ? <p className="success-line">{runtimeNotice}</p> : null}

            {!runtimeDraft || !runtimeSettings ? (
              <p className="meta-line">Loading route setting...</p>
            ) : (
              <div className="settings-group-stack runtime-settings-stack">
                <section className="settings-group-card">
                  <h3>Configured</h3>
                  <div className="schema-grid two-col">
                    <label className="settings-field runtime-settings-field">
                      <span>Local Runtime Port</span>
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        value={runtimeDraft.port}
                        onChange={(event) =>
                          setRuntimeDraft((previous) =>
                            previous
                              ? {
                                  ...previous,
                                  port: Number(event.target.value || previous.port)
                                }
                              : previous
                          )
                        }
                      />
                    </label>

                    <label className="settings-field runtime-settings-field">
                      <span>Route Prefix</span>
                      <input
                        value={runtimeDraft.routePrefix}
                        onChange={(event) =>
                          setRuntimeDraft((previous) =>
                            previous
                              ? {
                                  ...previous,
                                  routePrefix: event.target.value
                                }
                              : previous
                          )
                        }
                      />
                    </label>
                  </div>
                  <div className="runtime-url-preview">
                    <p className="meta-line">Runtime URL</p>
                    <p>
                      <code>{`${runtimeSettings.effective.baseUrl}${runtimeSettings.effective.routePrefix}`}</code>
                    </p>
                  </div>
                </section>
              </div>
            )}
          </section>
        ) : null}

        {tab === 'providers' ? <ProviderList /> : null}
      </section>
    </section>
  );
}
