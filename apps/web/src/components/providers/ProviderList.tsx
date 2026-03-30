import { useEffect, useRef, useState } from 'react';
import type { ProviderConnectionTestResponse, ProviderType } from '@contrix/spec-core';
import { useProviderStore } from '../../store/useProviderStore';
import { ProviderForm } from './ProviderForm';
import { useI18n } from '../../i18n';
import { ModalShell } from '../common/ModalShell';
import { getProviderPresetById, inferProviderPresetId } from '../../config/providerPresets';
import { useToast } from '../common/ToastProvider';

function shortenId(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 12) {
    return normalized;
  }

  return `${normalized.slice(0, 8)}...${normalized.slice(-4)}`;
}

function formatTimeout(timeoutMs: number): string {
  const seconds = Math.max(1, Math.round(timeoutMs / 1000));
  return `${seconds}s`;
}

function formatRetry(maxRetries: number | null): string {
  if (maxRetries === null || maxRetries === undefined) {
    return 'Default';
  }

  return String(maxRetries);
}

function isCacheMetricsSupported(provider: {
  type: ProviderType;
  baseUrl: string | null;
}): boolean {
  const presetId = inferProviderPresetId({
    type: provider.type,
    baseUrl: provider.baseUrl
  });
  const preset = getProviderPresetById(presetId);

  return (
    preset.cacheMetricsTone === 'documented' || preset.cacheMetricsTone === 'varies'
  );
}

function deriveOperationalNote(provider: {
  notes: string | null;
  hasApiKey: boolean;
  supportsStructuredOutput: boolean;
  testResult?: ProviderConnectionTestResponse;
}): string {
  const note = provider.notes?.trim();
  if (note) {
    return note.length > 84 ? `${note.slice(0, 84)}...` : note;
  }

  if (!provider.hasApiKey) {
    return 'Missing secret';
  }

  if (!provider.supportsStructuredOutput) {
    return 'Structured output not supported';
  }

  if (provider.testResult && !provider.testResult.success) {
    return 'Secret has issue';
  }

  return 'Ready for runtime';
}

function buildTestResultMarker(testResult: ProviderConnectionTestResponse): string {
  return `${testResult.testedAt}:${testResult.success}:${testResult.message}:${testResult.latencyMs}`;
}

export function ProviderList() {
  const {
    providers,
    editingProviderId,
    listLoading,
    listError,
    testingById,
    deletingById,
    testResultsById,
    startEditingProvider,
    cancelEditingProvider,
    testProvider,
    deleteProvider
  } = useProviderStore();
  const { t } = useI18n();
  const { pushToast } = useToast();
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const initializedTestResultsRef = useRef(false);
  const seenTestResultRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (editingProviderId) {
      setIsFormModalOpen(true);
    }
  }, [editingProviderId]);

  useEffect(() => {
    const entries = Object.entries(testResultsById);

    if (!initializedTestResultsRef.current) {
      entries.forEach(([providerId, result]) => {
        seenTestResultRef.current[providerId] = buildTestResultMarker(result);
      });
      initializedTestResultsRef.current = true;
      return;
    }

    entries.forEach(([providerId, result]) => {
      const marker = buildTestResultMarker(result);
      if (seenTestResultRef.current[providerId] === marker) {
        return;
      }
      seenTestResultRef.current[providerId] = marker;

      const providerName =
        providers.find((provider) => provider.id === providerId)?.name ?? providerId;

      if (result.success) {
        pushToast({
          tone: 'success',
          title: t('Ping ok'),
          message: `${providerName} (${result.latencyMs} ms)`,
          durationMs: 4500
        });
        return;
      }

      pushToast({
        tone: 'error',
        title: t('Connection issue'),
        message: `${providerName}: ${result.message}`,
        durationMs: 7000
      });
    });
  }, [providers, pushToast, t, testResultsById]);

  const openCreateModal = () => {
    cancelEditingProvider();
    setIsFormModalOpen(true);
  };

  const openEditModal = (providerId: string) => {
    startEditingProvider(providerId);
    setIsFormModalOpen(true);
  };

  const closeFormModal = () => {
    cancelEditingProvider();
    setIsFormModalOpen(false);
  };

  const handleDelete = async (providerId: string, providerName: string) => {
    const confirmed = window.confirm(
      t(`Delete provider "${providerName}"?`)
    );
    if (!confirmed) {
      return;
    }

    await deleteProvider(providerId);
  };

  return (
    <section className="panel">
      <div className="panel-header-row">
        <h2>{t('Provider List')}</h2>
        <button type="button" onClick={openCreateModal}>
          {t('Add Provider')}
        </button>
      </div>
      {listLoading && providers.length === 0 ? (
        <p className="meta-line">{t('Loading providers...')}</p>
      ) : null}
      {listError ? <p className="error-line">{listError}</p> : null}

      {providers.length === 0 ? (
        <div className="empty-provider-state">
          <button type="button" className="empty-provider-cta" onClick={openCreateModal}>
            {t(
              'Click top-right Add button or click here to create a provider.')}
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="provider-table">
            <thead>
              <tr>
                <th>{t('Nickname')}</th>
                <th>{t('Capabilities')}</th>
                <th>{t('Runtime Settings')}</th>
                <th>{t('Notes')}</th>
                <th>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((provider) => {
                const testResult = testResultsById[provider.id] ?? provider.lastConnectionTest ?? undefined;
                const isTesting = Boolean(testingById[provider.id]);
                const isDeleting = Boolean(deletingById[provider.id]);
                const isEditing = editingProviderId === provider.id;
                const isStructuredOutputSupported = provider.supportsStructuredOutput;
                const isCacheMetricsSupportedByProvider = isCacheMetricsSupported(provider);
                const structuredOutputStatusLabel = isStructuredOutputSupported
                  ? t('Supported')
                  : t('Not supported');
                const cacheMetricsStatusLabel = isCacheMetricsSupportedByProvider
                  ? t('Supported')
                  : t('Not supported');
                const readinessLabel = !provider.hasApiKey
                  ? t('Missing secret')
                  : isTesting
                    ? t('Pinging...')
                    : !testResult
                      ? t('Pending Ping')
                      : testResult.success
                        ? t('Ready')
                        : t('Secret issue');
                const readinessClass = !provider.hasApiKey
                  ? 'provider-badge provider-badge-yellow'
                  : isTesting || !testResult
                    ? 'provider-badge provider-badge-muted'
                    : testResult.success
                      ? 'provider-badge'
                      : 'provider-badge provider-badge-red';

                return (
                  <tr key={provider.id} className={isEditing ? 'row-selected' : undefined}>
                    <td>
                      <strong>{provider.name}</strong>
                      <p className="cell-note">
                        {t('Key')}: <code>{shortenId(provider.providerKey)}</code>
                      </p>
                      <div className="provider-status-stack">
                        <span className={readinessClass}>{readinessLabel}</span>
                        <span className="provider-badge provider-badge-blue">{provider.type}</span>
                      </div>
                    </td>
                    <td>
                      <div className="provider-kv-stack">
                        <p>
                          <span>{t('Native Structured Output')}</span>
                          <strong
                            className={
                              isStructuredOutputSupported
                                ? 'provider-capability-pill provider-capability-pill-supported'
                                : 'provider-capability-pill provider-capability-pill-not-supported'
                            }
                          >
                            {structuredOutputStatusLabel}
                          </strong>
                        </p>
                        <p>
                          <span>{t('Cache Metrics')}</span>
                          <strong
                            className={
                              isCacheMetricsSupportedByProvider
                                ? 'provider-capability-pill provider-capability-pill-supported'
                                : 'provider-capability-pill provider-capability-pill-not-supported'
                            }
                          >
                            {cacheMetricsStatusLabel}
                          </strong>
                        </p>
                      </div>
                    </td>
                    <td>
                      <div className="provider-kv-stack">
                        <p>
                          <span>{t('Timeout')}</span>
                          <strong>{formatTimeout(provider.timeoutMs)}</strong>
                        </p>
                        <p>
                          <span>{t('Retry')}</span>
                          <strong>{formatRetry(provider.maxRetries)}</strong>
                        </p>
                      </div>
                    </td>
                    <td>
                      <p className="provider-note">{deriveOperationalNote({ ...provider, testResult })}</p>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          onClick={() => openEditModal(provider.id)}
                          disabled={isDeleting || isTesting}
                        >
                          {t('Edit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void testProvider(provider.id)}
                          disabled={isTesting || isDeleting}
                        >
                          {isTesting ? t('Pinging...') : t('Ping')}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void handleDelete(provider.id, provider.name)}
                          disabled={isDeleting || isTesting}
                        >
                          {isDeleting ? t('Deleting...') : t('Delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isFormModalOpen ? (
        <ModalShell onClose={closeFormModal} cardClassName="provider-modal-card" bodyClassName="modal-window-body">
          <ProviderForm onSuccess={closeFormModal} onRequestClose={closeFormModal} />
        </ModalShell>
      ) : null}
    </section>
  );
}
