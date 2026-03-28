import { useProjectStore } from '../../store/useProjectStore';
import { useI18n } from '../../i18n';

interface GroupListProps {
  embedded?: boolean;
}

export function GroupList({ embedded = false }: GroupListProps) {
  const { selectedProjectDetail, editingGroupId, deletingGroupById, startEditingGroup, deleteGroup } = useProjectStore();
  const { t } = useI18n();

  if (!selectedProjectDetail) {
    return null;
  }

  const groups = selectedProjectDetail.groups;

  const handleDelete = async (groupId: string, name: string) => {
    const confirmed = window.confirm(
      t(
        `Delete group "${name}"? Endpoints under it will be ungrouped.`)
    );
    if (!confirmed) {
      return;
    }

    await deleteGroup(groupId);
  };

  const content = (
    <>
      <h3>{t('Groups')}</h3>
      {groups.length === 0 ? (
        <p className="meta-line">{t('No groups in this project.')}</p>
      ) : (
        <div className="table-wrap">
          <table className="project-table">
            <thead>
              <tr>
                <th>{t('Name')}</th>
                <th>{t('Description')}</th>
                <th>{t('Instruction')}</th>
                <th>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const isDeleting = Boolean(deletingGroupById[group.id]);
                const isEditing = editingGroupId === group.id;

                return (
                  <tr key={group.id} className={isEditing ? 'row-selected' : undefined}>
                    <td>{group.name}</td>
                    <td>{group.description ?? '-'}</td>
                    <td>{group.groupInstruction ?? '-'}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" onClick={() => startEditingGroup(group.id)} disabled={isDeleting}>
                          {t('Edit')}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void handleDelete(group.id, group.name)}
                          disabled={isDeleting}
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
    </>
  );

  if (embedded) {
    return <section className="panel compact-panel">{content}</section>;
  }

  return <section className="panel compact-panel">{content}</section>;
}

