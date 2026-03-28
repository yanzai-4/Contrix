import { useEffect, useState } from 'react';
import { parseEndpointFallbackConfig, type EndpointSummary, type RuntimeSettingsResponse } from '@contrix/spec-core';
import { useI18n } from '../../i18n';
import { fetchRuntimeSettings } from '../../services/api';
import { ModalShell } from '../common/ModalShell';

interface EndpointDetailModalProps {
  endpoint: EndpointSummary;
  onClose: () => void;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function fallbackLabel(rawFallback: string | null): string | null {
  const parsed = parseEndpointFallbackConfig(rawFallback);
  if (!parsed || !parsed.enabled) {
    return null;
  }

  if (parsed.mode === 'auto_json') {
    return 'Auto JSON fallback';
  }

  if (parsed.mode === 'auto_text') {
    return 'Auto text fallback';
  }

  return 'Manual fallback';
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

export function EndpointDetailModal({ endpoint, onClose }: EndpointDetailModalProps) {
  const { t } = useI18n();
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettingsResponse | null>(null);
  const fallback = fallbackLabel(endpoint.fallback);
  const fallbackEnabled = Boolean(fallback);
  const fallbackDisplay = fallback ?? 'Off';
  const providerLabel = endpoint.providerName ?? endpoint.providerId ?? 'Not set';
  const modelLabel = endpoint.model ?? 'Not set';
  const timeoutLabel = endpoint.timeoutMs === null ? 'Not set' : `${Math.max(1, Math.round(endpoint.timeoutMs / 1000))}s`;
  const groupLabel = endpoint.groupName ?? 'Not set';
  const repairLabel = endpoint.enableDeterministicRepair ? 'Enabled' : 'Disabled';
  const temperatureLabel = endpoint.temperature === null ? null : String(endpoint.temperature);
  const topPLabel = endpoint.topP === null ? null : String(endpoint.topP);
  const routePath = endpoint.routePreview.startsWith('/') ? endpoint.routePreview : `/${endpoint.routePreview}`;
  const routeUrl = `${runtimeSettings?.effective.baseUrl ?? 'http://localhost:4411'}${routePath}`;

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const settings = await fetchRuntimeSettings();
        if (!mounted) {
          return;
        }
        setRuntimeSettings(settings);
      } catch {
        // Keep local fallback base URL when runtime settings are unavailable.
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <ModalShell onClose={onClose} size="wide">
      <section className="panel compact-panel endpoint-detail-panel">
        <header className="endpoint-detail-header">
          <h3 className="endpoint-detail-title">{endpoint.name}</h3>
          <p className="endpoint-detail-route-label">{t('Route')}</p>
          <code className="endpoint-detail-route-code">{routeUrl}</code>
        </header>

        <div className="endpoint-detail-meta endpoint-detail-meta-primary">
          <span className="endpoint-detail-pill endpoint-detail-pill-primary">
            <span className="endpoint-detail-pill-key">{t('Group')}</span>
            <strong>{groupLabel}</strong>
          </span>
          <span className="endpoint-detail-pill endpoint-detail-pill-primary">
            <span className="endpoint-detail-pill-key">{t('Provider')}</span>
            <strong>{providerLabel}</strong>
          </span>
          <span className="endpoint-detail-pill endpoint-detail-pill-primary">
            <span className="endpoint-detail-pill-key">{t('Model')}</span>
            <strong>{modelLabel}</strong>
          </span>
          <span className="endpoint-detail-pill endpoint-detail-pill-primary">
            <span className="endpoint-detail-pill-key">{t('Timeout')}</span>
            <strong>{timeoutLabel}</strong>
          </span>
          <span className="endpoint-detail-pill endpoint-detail-pill-primary">
            <span className="endpoint-detail-pill-key">{t('API Retry Attempts')}</span>
            <strong>{endpoint.maxApiRetries}</strong>
          </span>
          <span
            className={`endpoint-detail-pill endpoint-detail-pill-primary endpoint-detail-pill-fallback ${
              fallbackEnabled ? 'is-on' : 'is-off'
            }`}
          >
            <span className="endpoint-detail-pill-key">{t('Fallback')}</span>
            <strong>{fallbackDisplay}</strong>
          </span>
        </div>

        <section className="endpoint-detail-section endpoint-detail-section-main">
          <h4>{t('Instruction')}</h4>
          {hasText(endpoint.endpointInstruction) ? (
            <p>{endpoint.endpointInstruction}</p>
          ) : (
            <p className="endpoint-detail-empty">Not set.</p>
          )}
        </section>

        <div className="endpoint-detail-meta endpoint-detail-meta-secondary">
          <span className="endpoint-detail-pill endpoint-detail-pill-secondary">
            <span className="endpoint-detail-pill-key">{t('Updated')}</span>
            <span>{formatDate(endpoint.updatedAt)}</span>
          </span>
          <span className="endpoint-detail-pill endpoint-detail-pill-secondary">
            <span className="endpoint-detail-pill-key">{t('Deterministic Repair')}</span>
            <span>{repairLabel}</span>
          </span>
          {temperatureLabel ? (
            <span className="endpoint-detail-pill endpoint-detail-pill-secondary">
              <span className="endpoint-detail-pill-key">{t('Temperature')}</span>
              <span>{temperatureLabel}</span>
            </span>
          ) : null}
          {topPLabel ? (
            <span className="endpoint-detail-pill endpoint-detail-pill-secondary">
              <span className="endpoint-detail-pill-key">{t('Top P')}</span>
              <span>{topPLabel}</span>
            </span>
          ) : null}
        </div>

        {hasText(endpoint.description) ? (
          <section className="endpoint-detail-section endpoint-detail-section-subtle">
            <h4>{t('Description')}</h4>
            <p>{endpoint.description}</p>
          </section>
        ) : null}
      </section>
    </ModalShell>
  );
}
