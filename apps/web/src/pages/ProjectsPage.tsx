import { useEffect } from 'react';
import { useState } from 'react';
import { ProjectForm } from '../components/projects/ProjectForm';
import { ProjectList } from '../components/projects/ProjectList';
import { ModalShell } from '../components/common/ModalShell';
import { useProjectStore } from '../store/useProjectStore';
import { useI18n } from '../i18n';

interface ProjectsPageProps {
  onOpenProjectDetail: (projectId: string) => void;
}

export function ProjectsPage({ onOpenProjectDetail }: ProjectsPageProps) {
  const initialize = useProjectStore((state) => state.initialize);
  const cancelEditingProject = useProjectStore((state) => state.cancelEditingProject);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const openCreateModal = () => {
    cancelEditingProject();
    setIsProjectModalOpen(true);
  };

  const closeProjectModal = () => {
    cancelEditingProject();
    setIsProjectModalOpen(false);
  };

  return (
    <section className="projects-page-stack">
      <section className="panel">
        <h2>{t('Contracts / Endpoints')}</h2>
        <p className="meta-line">
          {t(
            'Build hierarchical AI contracts: Project instruction - Group instruction - Endpoint contract.')}
        </p>
        <p className="meta-line">
          {t(
            'Spec is the upstream source of truth. Prompt is compiled output. Runtime is execution/debugging output.')}
        </p>
      </section>

      <ProjectList
        onOpenProjectDetail={onOpenProjectDetail}
        onOpenCreateModal={openCreateModal}
      />

      {isProjectModalOpen ? (
        <ModalShell onClose={closeProjectModal}>
          <ProjectForm onSuccess={closeProjectModal} onRequestClose={closeProjectModal} />
        </ModalShell>
      ) : null}
    </section>
  );
}
