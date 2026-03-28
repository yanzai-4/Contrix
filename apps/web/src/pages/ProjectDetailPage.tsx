import { useEffect, useState } from 'react';
import { ProjectDetailPanel } from '../components/projects/ProjectDetailPanel';
import { ProjectForm } from '../components/projects/ProjectForm';
import { ModalShell } from '../components/common/ModalShell';
import { useProjectStore } from '../store/useProjectStore';
import { useI18n } from '../i18n';

interface ProjectDetailPageProps {
  projectId: string;
  onBack: () => void;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString();
}

export function ProjectDetailPage({ projectId, onBack }: ProjectDetailPageProps) {
  const initialize = useProjectStore((state) => state.initialize);
  const selectProject = useProjectStore((state) => state.selectProject);
  const selectedProjectDetail = useProjectStore((state) => state.selectedProjectDetail);
  const editingProjectId = useProjectStore((state) => state.editingProjectId);
  const deletingProjectById = useProjectStore((state) => state.deletingProjectById);
  const startEditingProject = useProjectStore((state) => state.startEditingProject);
  const cancelEditingProject = useProjectStore((state) => state.cancelEditingProject);
  const deleteProject = useProjectStore((state) => state.deleteProject);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    void selectProject(projectId);
  }, [projectId, selectProject]);

  useEffect(() => {
    if (editingProjectId === projectId) {
      setIsProjectModalOpen(true);
    }
  }, [editingProjectId, projectId]);

  const openEditProject = () => {
    startEditingProject(projectId);
    setIsProjectModalOpen(true);
  };

  const closeProjectModal = () => {
    cancelEditingProject();
    setIsProjectModalOpen(false);
  };

  const handleDeleteProject = async () => {
    const projectName = selectedProjectDetail?.project.name ?? projectId;
    const confirmed = window.confirm(
      t(`Delete project "${projectName}"? This will remove its groups and endpoints.`)
    );

    if (!confirmed) {
      return;
    }

    await deleteProject(projectId);
    onBack();
  };

  const isDeleting = Boolean(deletingProjectById[projectId]);
  const project = selectedProjectDetail?.project;
  const endpointCount = selectedProjectDetail?.endpoints.length ?? 0;

  return (
    <section className="projects-page-stack">
      <section className="panel">
        <div className="panel-header-row">
          <div>
            <h2>{project?.name ?? t('Project Detail')}</h2>
            <p className="meta-line">{t('Manage settings, endpoints, preview, and test from here.')}</p>
            {project?.description ? <p className="meta-line">{project.description}</p> : null}
          </div>
          <div className="row-actions">
            <button type="button" className="btn-muted" onClick={onBack}>
              {t('Back to Projects')}
            </button>
            <button type="button" onClick={openEditProject} disabled={isDeleting}>
              {t('Edit Project')}
            </button>
            <button type="button" className="danger" onClick={() => void handleDeleteProject()} disabled={isDeleting}>
              {isDeleting ? t('Deleting...') : t('Delete Project')}
            </button>
          </div>
        </div>

        {project ? (
          <div className="project-summary-chips">
            <span className="summary-chip">
              Namespace <code>{project.apiNamespace}</code>
            </span>
            <span className="summary-chip">Default provider: {project.defaultProviderName ?? 'Not set'}</span>
            <span className="summary-chip">{endpointCount} endpoints</span>
            <span className="summary-chip">Created {formatDate(project.createdAt)}</span>
          </div>
        ) : null}
      </section>

      <ProjectDetailPanel />

      {isProjectModalOpen ? (
        <ModalShell onClose={closeProjectModal}>
          <ProjectForm onSuccess={closeProjectModal} onRequestClose={closeProjectModal} />
        </ModalShell>
      ) : null}
    </section>
  );
}
