import { useEffect, useMemo, useState } from 'react';
import type { EndpointSummary } from '@contrix/spec-core';
import { EndpointForm } from './EndpointForm';
import { EndpointList } from './EndpointList';
import { EndpointDetailModal } from './EndpointDetailModal';
import { GroupForm } from './GroupForm';
import { GroupList } from './GroupList';
import { EndpointRuntimePanel } from '../runtime/EndpointRuntimePanel';
import { EndpointIntegrateModal } from '../preview/EndpointIntegrateModal';
import { EndpointPreviewPanel, type EndpointPreviewTab } from '../preview/EndpointPreviewPanel';
import { ModalShell } from '../common/ModalShell';
import { useEndpointRuntimeStore } from '../../store/useEndpointRuntimeStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useI18n } from '../../i18n';

export function ProjectDetailPanel() {
  const {
    selectedProjectDetail,
    detailLoading,
    detailError,
    editingEndpointId,
    startEditingEndpoint,
    cancelEditingEndpoint,
    reloadSelectedProject
  } = useProjectStore();
  const { t } = useI18n();

  const runtimeEndpointId = useEndpointRuntimeStore((state) => state.endpointId);
  const closeRuntimePanel = useEndpointRuntimeStore((state) => state.closeRunner);
  const openRuntimePanel = useEndpointRuntimeStore((state) => state.openRunner);

  const [isEndpointModalOpen, setIsEndpointModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [integratingEndpointId, setIntegratingEndpointId] = useState<string | null>(null);
  const [previewingEndpointId, setPreviewingEndpointId] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<EndpointPreviewTab>('prompt');
  const [viewingEndpointId, setViewingEndpointId] = useState<string | null>(null);

  const integratingEndpoint = useMemo(() => {
    if (!selectedProjectDetail || !integratingEndpointId) {
      return null;
    }

    return selectedProjectDetail.endpoints.find((endpoint) => endpoint.id === integratingEndpointId) ?? null;
  }, [selectedProjectDetail, integratingEndpointId]);

  const previewingEndpoint = useMemo(() => {
    if (!selectedProjectDetail || !previewingEndpointId) {
      return null;
    }

    return selectedProjectDetail.endpoints.find((endpoint) => endpoint.id === previewingEndpointId) ?? null;
  }, [selectedProjectDetail, previewingEndpointId]);

  const viewingEndpoint = useMemo(() => {
    if (!selectedProjectDetail || !viewingEndpointId) {
      return null;
    }

    return selectedProjectDetail.endpoints.find((endpoint) => endpoint.id === viewingEndpointId) ?? null;
  }, [selectedProjectDetail, viewingEndpointId]);

  useEffect(() => {
    if (editingEndpointId) {
      setIsEndpointModalOpen(true);
    }
  }, [editingEndpointId]);

  useEffect(() => {
    if (!integratingEndpointId || !selectedProjectDetail) {
      return;
    }

    const exists = selectedProjectDetail.endpoints.some((endpoint) => endpoint.id === integratingEndpointId);
    if (!exists) {
      setIntegratingEndpointId(null);
    }
  }, [integratingEndpointId, selectedProjectDetail]);

  useEffect(() => {
    if (!previewingEndpointId || !selectedProjectDetail) {
      return;
    }

    const exists = selectedProjectDetail.endpoints.some((endpoint) => endpoint.id === previewingEndpointId);
    if (!exists) {
      setPreviewingEndpointId(null);
    }
  }, [previewingEndpointId, selectedProjectDetail]);

  useEffect(() => {
    if (!viewingEndpointId || !selectedProjectDetail) {
      return;
    }

    const exists = selectedProjectDetail.endpoints.some((endpoint) => endpoint.id === viewingEndpointId);
    if (!exists) {
      setViewingEndpointId(null);
    }
  }, [viewingEndpointId, selectedProjectDetail]);

  if (detailLoading) {
    return (
      <section className="panel">
        <h2>{t('Project Detail')}</h2>
        <p className="meta-line">{t('Loading project details...')}</p>
      </section>
    );
  }

  if (detailError) {
    return (
      <section className="panel">
        <h2>{t('Project Detail')}</h2>
        <p className="error-line">{detailError}</p>
      </section>
    );
  }

  if (!selectedProjectDetail) {
    return (
      <section className="panel">
        <h2>{t('Project Detail')}</h2>
        <p className="meta-line">{t('Select a project to manage its endpoints.')}</p>
      </section>
    );
  }

  const { endpoints } = selectedProjectDetail;

  const openCreateEndpoint = () => {
    cancelEditingEndpoint();
    setIsEndpointModalOpen(true);
  };

  const closeEndpointModal = () => {
    cancelEditingEndpoint();
    setIsEndpointModalOpen(false);
  };

  const openEditEndpoint = (endpointId: string) => {
    startEditingEndpoint(endpointId);
    setIsEndpointModalOpen(true);
  };

  const openDetails = (endpoint: EndpointSummary) => {
    setViewingEndpointId(endpoint.id);
  };

  const openIntegrate = (endpoint: EndpointSummary) => {
    setIntegratingEndpointId(endpoint.id);
  };

  const closeIntegrate = () => {
    setIntegratingEndpointId(null);
  };

  const openPreview = (endpoint: EndpointSummary, tab: EndpointPreviewTab) => {
    setPreviewingEndpointId(endpoint.id);
    setPreviewTab(tab);
  };

  const closePreview = () => {
    setPreviewingEndpointId(null);
  };

  const openTest = (endpoint: EndpointSummary) => {
    void (async () => {
      await openRuntimePanel(endpoint);
      await reloadSelectedProject();
    })();
  };

  return (
    <section className="project-detail-stack">
      <EndpointList
        onAddEndpoint={openCreateEndpoint}
        onManageGroups={() => setIsGroupModalOpen(true)}
        onEditEndpoint={openEditEndpoint}
        onTestEndpoint={openTest}
        onOpenIntegrate={openIntegrate}
        onOpenPreview={openPreview}
        onOpenDetails={openDetails}
      />

      {isEndpointModalOpen ? (
        <ModalShell onClose={closeEndpointModal} size="xl">
          <EndpointForm embedded onSuccess={closeEndpointModal} onRequestClose={closeEndpointModal} />
        </ModalShell>
      ) : null}

      {isGroupModalOpen ? (
        <ModalShell onClose={() => setIsGroupModalOpen(false)} size="xl">
          <section className="panel compact-panel">
            <div className="panel-header-row">
              <h3>{t('Manage Groups')}</h3>
            </div>
            <div className="spec-grid">
              <GroupList embedded />
              <GroupForm embedded />
            </div>
          </section>
        </ModalShell>
      ) : null}

      {viewingEndpoint ? <EndpointDetailModal endpoint={viewingEndpoint} onClose={() => setViewingEndpointId(null)} /> : null}

      {integratingEndpoint ? (
        <ModalShell onClose={closeIntegrate} size="xxl">
          <EndpointIntegrateModal endpoint={integratingEndpoint} />
        </ModalShell>
      ) : null}

      {previewingEndpoint ? (
        <ModalShell onClose={closePreview} size="xxl">
          <EndpointPreviewPanel endpoint={previewingEndpoint} initialTab={previewTab} />
        </ModalShell>
      ) : null}

      {runtimeEndpointId ? (
        <ModalShell onClose={closeRuntimePanel} size="xxl">
          <EndpointRuntimePanel />
        </ModalShell>
      ) : null}
    </section>
  );
}
