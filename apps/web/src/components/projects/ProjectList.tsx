import { useProjectStore } from '../../store/useProjectStore';
import { useI18n } from '../../i18n';

interface ProjectListProps {
  onOpenProjectDetail: (projectId: string) => void;
  onOpenCreateModal: () => void;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString();
}

export function ProjectList({ onOpenProjectDetail, onOpenCreateModal }: ProjectListProps) {
  const { projects, projectsLoading, selectedProjectId, listError } = useProjectStore();
  const { t } = useI18n();

  return (
    <section className="panel project-list-panel">
      <div className="panel-header-row">
        <h2>{t('Project List')}</h2>
        <button type="button" onClick={onOpenCreateModal}>
          {t('Add Project')}
        </button>
      </div>
      {projectsLoading ? <p className="meta-line">{t('Loading projects...')}</p> : null}
      {listError ? <p className="error-line">{listError}</p> : null}

      {projects.length === 0 ? (
        <div className="empty-provider-state">
          <button type="button" className="empty-provider-cta" onClick={onOpenCreateModal}>
            {t('Create your first project')}
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="project-table list-themed-table">
            <thead>
              <tr>
                <th>{t('Name')}</th>
                <th>{t('Namespace')}</th>
                <th>{t('Default Provider')}</th>
                <th>{t('Created')}</th>
                <th>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const isSelected = selectedProjectId === project.id;

                return (
                  <tr key={project.id} className={isSelected ? 'row-selected' : undefined}>
                    <td>
                      <strong>{project.name}</strong>
                      {project.description ? <p className="cell-note">{project.description}</p> : null}
                    </td>
                    <td>{project.apiNamespace}</td>
                    <td>{project.defaultProviderName ?? '-'}</td>
                    <td>{formatDate(project.createdAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="row-action-btn" onClick={() => onOpenProjectDetail(project.id)}>
                          {t('Open Project')}
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
    </section>
  );
}
