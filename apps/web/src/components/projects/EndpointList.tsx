import { useEffect } from 'react';
import type { EndpointSummary } from '@contrix/spec-core';
import type { EndpointPreviewTab } from '../preview/EndpointPreviewPanel';
import { useProjectStore } from '../../store/useProjectStore';
import { useI18n } from '../../i18n';

interface EndpointListProps {
  onAddEndpoint: () => void;
  onManageGroups: () => void;
  onEditEndpoint: (endpointId: string) => void;
  onTestEndpoint: (endpoint: EndpointSummary) => void;
  onOpenIntegrate: (endpoint: EndpointSummary) => void;
  onOpenPreview: (endpoint: EndpointSummary, tab: EndpointPreviewTab) => void;
  onOpenDetails: (endpoint: EndpointSummary) => void;
}

function formatRelativeTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const diffMs = Date.now() - parsed.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return 'just now';
  }

  if (diffMs < hour) {
    return `${Math.floor(diffMs / minute)}m ago`;
  }

  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}h ago`;
  }

  if (diffMs < 30 * day) {
    return `${Math.floor(diffMs / day)}d ago`;
  }

  return parsed.toLocaleDateString();
}

function closeMoreMenu(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  const details = element?.closest('details');

  if (details instanceof HTMLDetailsElement) {
    details.open = false;
  }
}

function closeAllMoreMenus() {
  const openMenus = document.querySelectorAll<HTMLDetailsElement>('.row-menu[open]');
  openMenus.forEach((menu) => {
    menu.open = false;
  });
}

export function EndpointList({
  onAddEndpoint,
  onManageGroups,
  onEditEndpoint,
  onTestEndpoint,
  onOpenIntegrate,
  onOpenPreview,
  onOpenDetails
}: EndpointListProps) {
  const {
    selectedProjectDetail,
    deletingEndpointById,
    deleteEndpoint
  } = useProjectStore();
  const { t } = useI18n();

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('.row-menu')) {
        return;
      }

      closeAllMoreMenus();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, []);

  if (!selectedProjectDetail) {
    return null;
  }

  const endpoints = selectedProjectDetail.endpoints;

  const handleDelete = async (endpointId: string, endpointName: string) => {
    const confirmed = window.confirm(t(`Delete endpoint "${endpointName}"?`));
    if (!confirmed) {
      return;
    }

    await deleteEndpoint(endpointId);
  };

  return (
    <section className="panel compact-panel">
      <div className="panel-header-row">
        <div>
          <h3>{t('Endpoints')}</h3>
          <p className="meta-line">{endpoints.length} endpoints</p>
        </div>
        <div className="row-actions">
          <button type="button" className="btn-muted" onClick={onManageGroups}>
            {t('Manage Groups')}
          </button>
          <button type="button" onClick={onAddEndpoint}>
            {t('Add Endpoint')}
          </button>
        </div>
      </div>

      {endpoints.length === 0 ? (
        <p className="meta-line">{t('No endpoints yet. Add one to start building.')}</p>
      ) : (
        <div className="table-wrap endpoint-table-wrap">
          <table className="project-table endpoint-table">
            <thead>
              <tr>
                <th>{t('Name')}</th>
                <th>{t('Route')}</th>
                <th>{t('Provider / Model')}</th>
                <th>{t('Updated')}</th>
                <th>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((endpoint) => {
                const isDeleting = Boolean(deletingEndpointById[endpoint.id]);
                const providerLabel = endpoint.providerName ?? endpoint.providerId ?? 'No provider';
                const modelLabel = endpoint.model?.trim() ? endpoint.model : 'No model';

                return (
                  <tr key={endpoint.id}>
                    <td>
                      <strong className="endpoint-name-text">{endpoint.name}</strong>
                      {endpoint.description ? <p className="cell-note">{endpoint.description}</p> : null}
                    </td>
                    <td>
                      <code className="route-preview">{endpoint.routePreview}</code>
                    </td>
                    <td>
                      <p className="meta-line endpoint-provider">{providerLabel}</p>
                      <p className="meta-line endpoint-model">{modelLabel}</p>
                    </td>
                    <td>
                      <p className="meta-line">{formatRelativeTime(endpoint.updatedAt)}</p>
                    </td>
                    <td>
                      <div className="row-actions endpoint-row-actions">
                        <button
                          type="button"
                          className="row-action-btn endpoint-action-btn endpoint-action-secondary"
                          onClick={() => onEditEndpoint(endpoint.id)}
                          disabled={isDeleting}
                        >
                          {t('Edit')}
                        </button>
                        <button
                          type="button"
                          className="row-action-btn endpoint-action-btn endpoint-action-secondary"
                          onClick={() => onTestEndpoint(endpoint)}
                          disabled={isDeleting}
                        >
                          {t('Test')}
                        </button>
                        <button
                          type="button"
                          className="row-action-btn endpoint-action-btn endpoint-action-primary"
                          onClick={() => onOpenIntegrate(endpoint)}
                          disabled={isDeleting}
                        >
                          {t('Integrate')}
                        </button>
                        <details className="row-menu">
                          <summary className="row-menu-trigger row-action-btn endpoint-action-btn endpoint-action-ghost">
                            <span>{t('More')}</span>
                            <span className="row-menu-caret" aria-hidden="true">
                              v
                            </span>
                          </summary>
                          <div className="row-menu-list">
                            <button
                              type="button"
                              className="row-menu-item"
                              onClick={(event) => {
                                closeMoreMenu(event.currentTarget);
                                onOpenPreview(endpoint, 'prompt');
                              }}
                            >
                              {t('Preview')}
                            </button>
                            <button
                              type="button"
                              className="row-menu-item"
                              onClick={(event) => {
                                closeMoreMenu(event.currentTarget);
                                onOpenDetails(endpoint);
                              }}
                            >
                              {t('View Details')}
                            </button>
                            <div className="row-menu-divider" aria-hidden="true" />
                            <button
                              type="button"
                              className="row-menu-item row-menu-item-danger"
                              onClick={(event) => {
                                closeMoreMenu(event.currentTarget);
                                void handleDelete(endpoint.id, endpoint.name);
                              }}
                              disabled={isDeleting}
                            >
                              {isDeleting ? t('Deleting...') : t('Delete')}
                            </button>
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
