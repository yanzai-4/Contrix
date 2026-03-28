import { useEffect, useMemo, useState } from 'react';
import type { CreateGroupRequest, UpdateGroupRequest } from '@contrix/spec-core';
import { useProjectStore } from '../../store/useProjectStore';
import { useI18n } from '../../i18n';

interface GroupFormProps {
  embedded?: boolean;
  onSuccess?: () => void;
}

interface GroupFormState {
  name: string;
  description: string;
  groupInstruction: string;
}

const initialState: GroupFormState = {
  name: '',
  description: '',
  groupInstruction: ''
};

function toFormState(group: { name: string; description: string | null; groupInstruction: string | null }): GroupFormState {
  return {
    name: group.name,
    description: group.description ?? '',
    groupInstruction: group.groupInstruction ?? ''
  };
}

export function GroupForm({ embedded = false, onSuccess }: GroupFormProps) {
  const {
    selectedProjectDetail,
    editingGroupId,
    groupSubmitting,
    formError,
    createGroup,
    updateGroup,
    clearFormError,
    cancelEditingGroup
  } = useProjectStore();
  const { t } = useI18n();
  const [formState, setFormState] = useState<GroupFormState>(initialState);
  const [localError, setLocalError] = useState<string | null>(null);

  const editingGroup = useMemo(() => {
    if (!selectedProjectDetail || !editingGroupId) {
      return null;
    }

    return selectedProjectDetail.groups.find((group) => group.id === editingGroupId) ?? null;
  }, [selectedProjectDetail, editingGroupId]);

  useEffect(() => {
    if (!editingGroup) {
      setFormState(initialState);
      return;
    }

    setFormState(toFormState(editingGroup));
  }, [editingGroup]);

  if (!selectedProjectDetail) {
    return null;
  }

  const updateField = <K extends keyof GroupFormState>(key: K, value: GroupFormState[K]) => {
    setFormState((state) => ({ ...state, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFormError();
    setLocalError(null);

    const name = formState.name.trim();
    if (!name) {
      setLocalError(t('Group name is required.'));
      return;
    }

    let success = false;

    if (editingGroup) {
      const payload: UpdateGroupRequest = {
        name,
        description: formState.description.trim() || undefined,
        groupInstruction: formState.groupInstruction.trim() || undefined
      };
      success = await updateGroup(editingGroup.id, payload);
    } else {
      const payload: Omit<CreateGroupRequest, 'projectId'> = {
        name,
        description: formState.description.trim() || undefined,
        groupInstruction: formState.groupInstruction.trim() || undefined
      };
      success = await createGroup(payload);
    }

    if (success) {
      setFormState(initialState);
      setLocalError(null);
      onSuccess?.();
    }
  };

  const content = (
    <>
      <h3>
        {editingGroup
          ? t(`Edit Group: ${editingGroup.name}`)
          : t('Create Group')}
      </h3>
      <form className="project-form" onSubmit={handleSubmit}>
        <label>
          {t('Name')}
          <input
            value={formState.name}
            onChange={(event) => updateField('name', event.target.value)}
            placeholder="Extraction"
          />
        </label>

        <label>
          {t('Description')}
          <textarea rows={2} value={formState.description} onChange={(event) => updateField('description', event.target.value)} />
        </label>

        <label>
          {t('Group Instruction')}
          <textarea
            rows={3}
            value={formState.groupInstruction}
            onChange={(event) => updateField('groupInstruction', event.target.value)}
          />
        </label>

        {localError ? <p className="error-line">{localError}</p> : null}
        {formError ? <p className="error-line">{formError}</p> : null}

        <div className="row-actions">
          <button type="submit" disabled={groupSubmitting}>
            {groupSubmitting
              ? editingGroup
                ? t('Saving...')
                : t('Creating...')
              : editingGroup
                ? t('Save group')
                : t('Create group')}
          </button>

          {editingGroup ? (
            <button type="button" className="danger" onClick={cancelEditingGroup} disabled={groupSubmitting}>
              {t('Cancel edit')}
            </button>
          ) : null}
        </div>
      </form>
    </>
  );

  if (embedded) {
    return <section className="panel compact-panel">{content}</section>;
  }

  return <section className="panel compact-panel">{content}</section>;
}

