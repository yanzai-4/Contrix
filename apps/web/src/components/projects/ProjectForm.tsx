import { useEffect, useMemo, useState } from 'react';
import type { CreateProjectRequest, UpdateProjectRequest } from '@contrix/spec-core';
import { useProjectStore } from '../../store/useProjectStore';
import { useI18n } from '../../i18n';

interface ProjectFormState {
  name: string;
  apiNamespace: string;
  description: string;
  baseInstruction: string;
  defaultProviderId: string;
}

interface ProjectFormProps {
  onSuccess?: () => void;
  onRequestClose?: () => void;
}

const initialState: ProjectFormState = {
  name: '',
  apiNamespace: '',
  description: '',
  baseInstruction: '',
  defaultProviderId: ''
};

function namespaceFromProjectName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toFormState(project: {
  name: string;
  apiNamespace: string;
  description: string | null;
  baseInstruction: string | null;
  defaultProviderId: string | null;
}): ProjectFormState {
  return {
    name: project.name,
    apiNamespace: project.apiNamespace,
    description: project.description ?? '',
    baseInstruction: project.baseInstruction ?? '',
    defaultProviderId: project.defaultProviderId ?? ''
  };
}

export function ProjectForm({ onSuccess, onRequestClose }: ProjectFormProps) {
  const {
    projects,
    selectedProjectDetail,
    providerOptions,
    editingProjectId,
    projectSubmitting,
    formError,
    createProject,
    updateProject,
    clearFormError,
    cancelEditingProject
  } = useProjectStore();
  const { t } = useI18n();

  const [formState, setFormState] = useState<ProjectFormState>(initialState);
  const [localError, setLocalError] = useState<string | null>(null);
  const [apiNamespaceManuallyEdited, setApiNamespaceManuallyEdited] = useState(false);

  const editingProject = useMemo(() => {
    if (!editingProjectId) {
      return null;
    }

    if (selectedProjectDetail?.project.id === editingProjectId) {
      return selectedProjectDetail.project;
    }

    return projects.find((project) => project.id === editingProjectId) ?? null;
  }, [editingProjectId, projects, selectedProjectDetail]);

  useEffect(() => {
    if (!editingProject) {
      setFormState(initialState);
      setApiNamespaceManuallyEdited(false);
      return;
    }

    setFormState(toFormState(editingProject));
    setApiNamespaceManuallyEdited(true);
  }, [editingProject]);

  const updateField = <K extends keyof ProjectFormState>(key: K, value: ProjectFormState[K]) => {
    setFormState((state) => ({ ...state, [key]: value }));
  };

  const handleNameChange = (value: string) => {
    setFormState((state) => ({
      ...state,
      name: value,
      apiNamespace: apiNamespaceManuallyEdited ? state.apiNamespace : namespaceFromProjectName(value)
    }));
  };

  const handleApiNamespaceChange = (value: string) => {
    setApiNamespaceManuallyEdited(true);
    updateField('apiNamespace', value);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFormError();
    setLocalError(null);

    const name = formState.name.trim();
    const apiNamespace = formState.apiNamespace.trim();

    if (!name) {
      setLocalError(t('Project name is required.'));
      return;
    }

    if (!apiNamespace) {
      setLocalError(t('API namespace is required.'));
      return;
    }

    const payloadBase = {
      name,
      apiNamespace,
      description: formState.description.trim() || undefined,
      baseInstruction: formState.baseInstruction.trim() || undefined,
      defaultProviderId: formState.defaultProviderId || undefined
    };

    let success = false;

    if (editingProject) {
      const payload: UpdateProjectRequest = payloadBase;
      success = await updateProject(editingProject.id, payload);
    } else {
      const payload: CreateProjectRequest = payloadBase;
      success = await createProject(payload);
    }

    if (success) {
      setFormState(initialState);
      setLocalError(null);
      onSuccess?.();
    }
  };

  const handleCancelEdit = () => {
    cancelEditingProject();
    onRequestClose?.();
  };

  return (
    <section className="panel">
      <h2>
        {editingProject
          ? t(`Edit Project: ${editingProject.name}`)
          : t('Create Project')}
      </h2>
      <form className="project-form" onSubmit={handleSubmit}>
        <label>
          {t('Name')}
          <input
            value={formState.name}
            onChange={(event) => handleNameChange(event.target.value)}
            placeholder="Billing Tools"
          />
        </label>

        <label>
          {t('API Namespace')}
          <input
            value={formState.apiNamespace}
            onChange={(event) => handleApiNamespaceChange(event.target.value)}
            placeholder="billing-tools"
          />
        </label>

        <label>
          {t('Default Provider')}
          <select
            value={formState.defaultProviderId}
            onChange={(event) => updateField('defaultProviderId', event.target.value)}
          >
            <option value="">{t('None')}</option>
            {providerOptions.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name} ({provider.type})
              </option>
            ))}
          </select>
        </label>

        <label>
          {t('Description')}
          <textarea
            rows={3}
            value={formState.description}
            onChange={(event) => updateField('description', event.target.value)}
          />
        </label>

        <label>
          {t('Base Instruction')}
          <textarea
            rows={4}
            value={formState.baseInstruction}
            onChange={(event) => updateField('baseInstruction', event.target.value)}
          />
        </label>

        {localError ? <p className="error-line">{localError}</p> : null}
        {formError ? <p className="error-line">{formError}</p> : null}

        <div className="row-actions">
          <button type="submit" disabled={projectSubmitting}>
            {projectSubmitting
              ? editingProject
                ? t('Saving...')
                : t('Creating...')
              : editingProject
                ? t('Save project')
                : t('Create project')}
          </button>

          {editingProject ? (
            <button
              type="button"
              className="danger"
              onClick={handleCancelEdit}
              disabled={projectSubmitting}
            >
              {t('Cancel edit')}
            </button>
          ) : onRequestClose ? (
            <button type="button" className="danger" onClick={onRequestClose} disabled={projectSubmitting}>
              {t('Close')}
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
