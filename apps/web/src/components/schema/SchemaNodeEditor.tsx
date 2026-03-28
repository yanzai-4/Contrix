import { useEffect, useState } from 'react';
import type {
  InternalSchemaNode,
  SchemaFieldDefinition,
  SchemaNodeType
} from '@contrix/spec-core';
import { schemaNodeTypes } from '@contrix/spec-core';
import { cloneSchemaNode, createSchemaNodeForType, formatEnumValues, parseEnumInput, parseTypedExample } from './schema-editor-utils';
import { ModalShell } from '../common/ModalShell';

type FieldTypeOption = SchemaNodeType | 'enum';

function isEnumField(node: InternalSchemaNode): boolean {
  if (!(node.type === 'string' || node.type === 'number' || node.type === 'integer')) {
    return false;
  }
  const enumValues = (node as { enumValues?: unknown }).enumValues;
  return Array.isArray(enumValues);
}

const fieldTypeOptions: FieldTypeOption[] = [...schemaNodeTypes, 'enum'];
const arrayItemTypeOptions: SchemaNodeType[] = schemaNodeTypes.filter((type) => type !== 'array' && type !== 'object');

interface SchemaNodeEditorProps {
  node: InternalSchemaNode;
  onChange: (next: InternalSchemaNode) => void;
  title?: string;
  depth?: number;
  bareRoot?: boolean;
  disableTypeChange?: boolean;
  progressive?: boolean;
  hideObjectAdditionalProperties?: boolean;
  hideFieldConstraintsAndExample?: boolean;
  hideNullableAndDefault?: boolean;
  defaultFieldRequired?: boolean;
}

type FieldSettingsHelpTopic = 'description' | 'required' | 'constraints' | 'example';
interface FieldSettingsDraft {
  description: string;
  required: boolean;
  nullable: boolean;
  constraints: string;
  example: string;
  defaultValue: string;
}

const fieldSettingsHelpContent: Record<FieldSettingsHelpTopic, { title: string; description: string; example: string }> = {
  description: {
    title: 'Field Description (Optional)',
    description: 'Describe what this field means so the schema is easier to understand and maintain.',
    example: 'Example: Unique user identifier used for linking records.'
  },
  required: {
    title: 'Required',
    description: 'When enabled, this field must be present. Missing it will fail output validation.',
    example: 'Example: Keep Required enabled for `id` or `status` fields that are always needed.'
  },
  constraints: {
    title: 'Field Constraints (Optional)',
    description: 'Add a short rule for this field to tighten validation and reduce ambiguous outputs.',
    example: 'Example: Must be a valid ISO-8601 date string.'
  },
  example: {
    title: 'Field Example (Optional)',
    description: 'Provide a sample value to clarify expected format and help with prompt quality.',
    example: 'Example: user_12345'
  }
};

function toOptionalString(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toDefaultValue(rawValue: string, nodeType: InternalSchemaNode['type']): unknown {
  if (!rawValue.trim()) {
    return undefined;
  }

  if (nodeType === 'string') {
    return rawValue;
  }

  if (nodeType === 'boolean') {
    if (rawValue.toLowerCase() === 'true') {
      return true;
    }

    if (rawValue.toLowerCase() === 'false') {
      return false;
    }

    return rawValue;
  }

  if (nodeType === 'integer' || nodeType === 'number') {
    const parsed = Number(rawValue);
    return Number.isNaN(parsed) ? rawValue : parsed;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    return rawValue;
  }
}

function createDefaultField(requiredByDefault = false): SchemaFieldDefinition {
  return {
    key: 'field_name',
    required: requiredByDefault,
    node: {
      type: 'string'
    }
  };
}

function createFieldSettingsDraft(field: SchemaFieldDefinition): FieldSettingsDraft {
  return {
    description: field.node.description ?? '',
    required: field.required,
    nullable: Boolean(field.node.nullable),
    constraints: field.node.constraints ?? '',
    example: field.node.example === undefined || field.node.example === null ? '' : String(field.node.example),
    defaultValue: field.node.default === undefined || field.node.default === null ? '' : String(field.node.default)
  };
}

function sanitizeNestedArrayItems(node: InternalSchemaNode): boolean {
  let changed = false;

  if (node.type === 'array') {
    if (node.items.type === 'array' || node.items.type === 'object') {
      node.items = createSchemaNodeForType('string');
      changed = true;
    }

    if (sanitizeNestedArrayItems(node.items)) {
      changed = true;
    }
  }

  if (node.type === 'object') {
    for (const field of node.properties) {
      if (sanitizeNestedArrayItems(field.node)) {
        changed = true;
      }
    }
  }

  return changed;
}

export function SchemaNodeEditor({
  node,
  onChange,
  title,
  depth = 0,
  bareRoot = false,
  disableTypeChange = false,
  progressive = false,
  hideObjectAdditionalProperties = false,
  hideFieldConstraintsAndExample = false,
  hideNullableAndDefault = false,
  defaultFieldRequired = false
}: SchemaNodeEditorProps) {
  const [activeFieldIndex, setActiveFieldIndex] = useState<number | null>(null);
  const [activeFieldHelpTopic, setActiveFieldHelpTopic] = useState<FieldSettingsHelpTopic | null>(null);
  const [fieldSettingsDraft, setFieldSettingsDraft] = useState<FieldSettingsDraft | null>(null);
  const rootClassName = `schema-node depth-${depth}${bareRoot && depth === 0 ? ' schema-node-bare-root' : ''}`;

  useEffect(() => {
    if (node.type !== 'object') {
      return;
    }

    if (node.properties.length > 0) {
      return;
    }

    const seeded = cloneSchemaNode(node);
    seeded.properties = [createDefaultField(defaultFieldRequired)];
    onChange(seeded);
  }, [defaultFieldRequired, node, onChange]);

  useEffect(() => {
    const draft = cloneSchemaNode(node);
    if (!sanitizeNestedArrayItems(draft)) {
      return;
    }

    onChange(draft);
  }, [node, onChange]);

  const updateNode = (updater: (draft: InternalSchemaNode) => InternalSchemaNode) => {
    const draft = cloneSchemaNode(node);
    onChange(updater(draft));
  };

  const handleTypeChange = (value: string) => {
    if (disableTypeChange) {
      return;
    }

    const schemaType = value as SchemaNodeType;
    onChange(createSchemaNodeForType(schemaType));
  };

  const advancedOptions = (
    <>
      {!hideNullableAndDefault ? (
        <label className="checkbox-label schema-checkbox">
          <input
            type="checkbox"
            checked={Boolean(node.nullable)}
            onChange={(event) =>
              updateNode((draft) => {
                draft.nullable = event.target.checked;
                return draft;
              })
            }
          />
          Nullable
        </label>
      ) : null}

      <label>
        Field Constraints (Optional)
        <input
          value={node.constraints ?? ''}
          onChange={(event) =>
            updateNode((draft) => {
              draft.constraints = toOptionalString(event.target.value);
              return draft;
            })
          }
          placeholder="Short field-level rule"
        />
      </label>

      <label>
        Field Example (Optional)
        <input
          value={node.example === undefined || node.example === null ? '' : String(node.example)}
          onChange={(event) =>
            updateNode((draft) => {
              if (!event.target.value.trim()) {
                draft.example = undefined;
                return draft;
              }

              if (draft.type === 'string' || draft.type === 'number' || draft.type === 'integer' || draft.type === 'boolean') {
                draft.example = parseTypedExample(event.target.value, draft.type);
              } else {
                draft.example = event.target.value;
              }

              return draft;
            })
          }
          placeholder="Example value"
        />
      </label>

      {!hideNullableAndDefault ? (
        <label>
          Default Value
          <input
            value={node.default === undefined || node.default === null ? '' : String(node.default)}
            onChange={(event) =>
              updateNode((draft) => {
                draft.default = toDefaultValue(event.target.value, draft.type);
                return draft;
              })
            }
            placeholder="Optional default"
          />
        </label>
      ) : null}
    </>
  );

  const updateField = (fieldIndex: number, updater: (field: SchemaFieldDefinition) => void) => {
    updateNode((draft) => {
      if (draft.type === 'object') {
        const targetField = draft.properties[fieldIndex];
        if (targetField) {
          updater(targetField);
        }
      }

      return draft;
    });
  };

  const activeObjectField =
    node.type === 'object' && activeFieldIndex !== null ? node.properties[activeFieldIndex] ?? null : null;

  useEffect(() => {
    if (!activeObjectField) {
      setFieldSettingsDraft(null);
      return;
    }

    setFieldSettingsDraft((current) => current ?? createFieldSettingsDraft(activeObjectField));
  }, [activeObjectField]);

  if (node.type === 'object') {
    const canDeleteField = node.properties.length > 1;
    const activeFieldEditorIndex = activeFieldIndex ?? -1;
    const activeField = activeObjectField;
    const activeFieldHelp = activeFieldHelpTopic ? fieldSettingsHelpContent[activeFieldHelpTopic] : null;
    const guideDepth = Math.max(depth, 0);
    const closeFieldSettings = () => {
      setActiveFieldHelpTopic(null);
      setActiveFieldIndex(null);
      setFieldSettingsDraft(null);
    };
    const updateFieldSettingsDraft = (updater: (draft: FieldSettingsDraft) => void) => {
      setFieldSettingsDraft((current) => {
        const base = current ?? (activeField ? createFieldSettingsDraft(activeField) : null);
        if (!base) {
          return current;
        }

        const next = { ...base };
        updater(next);
        return next;
      });
    };
    const saveFieldSettings = () => {
      if (activeFieldEditorIndex < 0 || !activeField) {
        closeFieldSettings();
        return;
      }

      const draft = fieldSettingsDraft ?? createFieldSettingsDraft(activeField);
      updateField(activeFieldEditorIndex, (targetField) => {
        const currentDescription = activeField.node.description ?? '';
        if (draft.description !== currentDescription) {
          targetField.node.description = toOptionalString(draft.description);
        }

        if (draft.required !== activeField.required) {
          targetField.required = draft.required;
        }

        if (!hideNullableAndDefault) {
          if (draft.nullable !== Boolean(activeField.node.nullable)) {
            targetField.node.nullable = draft.nullable;
          }

          const currentDefaultValue =
            activeField.node.default === undefined || activeField.node.default === null
              ? ''
              : String(activeField.node.default);
          if (draft.defaultValue !== currentDefaultValue) {
            targetField.node.default = toDefaultValue(draft.defaultValue, targetField.node.type);
          }
        }

        if (!hideFieldConstraintsAndExample) {
          const currentConstraints = activeField.node.constraints ?? '';
          if (draft.constraints !== currentConstraints) {
            targetField.node.constraints = toOptionalString(draft.constraints);
          }

          const currentExample =
            activeField.node.example === undefined || activeField.node.example === null
              ? ''
              : String(activeField.node.example);
          if (draft.example !== currentExample) {
            if (!draft.example.trim()) {
              targetField.node.example = undefined;
            } else if (
              targetField.node.type === 'string' ||
              targetField.node.type === 'number' ||
              targetField.node.type === 'integer' ||
              targetField.node.type === 'boolean'
            ) {
              targetField.node.example = parseTypedExample(draft.example, targetField.node.type);
            } else {
              targetField.node.example = toOptionalString(draft.example);
            }
          }
        }
      });

      closeFieldSettings();
    };

    return (
      <section className={rootClassName}>
        {title ? <h5>{title}</h5> : null}

        <div className="schema-json-frame">
          {Array.from({ length: guideDepth }).map((_, level) => (
            <span key={`guide-${level}`} className="schema-json-guide-line" style={{ left: level * 12 + 4 }} />
          ))}
          <section className="schema-json-block" style={{ marginLeft: guideDepth * 12 }}>
            <div className="schema-json-line schema-json-brace">{'{'}</div>

            {node.properties.length === 0 ? (
              <p className="meta-line">No fields yet.</p>
            ) : (
              node.properties.map((field, fieldIndex) => (
                <section key={`field-${fieldIndex}`} className="schema-json-field-wrap schema-json-indented">
                  <div className="schema-json-field-row">
                    <input
                      value={field.key}
                      onChange={(event) => updateField(fieldIndex, (targetField) => (targetField.key = event.target.value))}
                      placeholder="field_name"
                    />
                    <span className="schema-json-colon">:</span>
                    <select
                      value={isEnumField(field.node) ? 'enum' : field.node.type}
                      onChange={(event) =>
                        updateField(fieldIndex, (targetField) => {
                          const nextType = event.target.value as FieldTypeOption;
                          if (nextType === 'enum') {
                            const enumNode = createSchemaNodeForType('string') as InternalSchemaNode & {
                              enumValues?: string[] | number[];
                            };
                            enumNode.enumValues = [];
                            targetField.node = enumNode;
                            return;
                          }

                          targetField.node = createSchemaNodeForType(nextType);
                        })
                      }
                    >
                      {fieldTypeOptions.map((type) => (
                        <option key={type} value={type}>
                          {type === 'enum' ? 'Enum' : type}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="schema-json-config-btn"
                      onClick={() => {
                        setActiveFieldHelpTopic(null);
                        setFieldSettingsDraft(createFieldSettingsDraft(field));
                        setActiveFieldIndex(fieldIndex);
                      }}
                      aria-label="Field settings"
                    >
                      Settings
                    </button>
                    <button
                      type="button"
                      className="schema-json-delete-btn"
                      onClick={() =>
                        updateNode((draft) => {
                          if (draft.type === 'object' && canDeleteField) {
                            draft.properties.splice(fieldIndex, 1);
                          }

                          return draft;
                        })
                      }
                      disabled={!canDeleteField}
                      aria-label="Delete field"
                    >
                      Delete
                    </button>
                  </div>

                  {isEnumField(field.node) ? (
                    <div className="schema-json-field-enum-row">
                      <span className="schema-json-enum-label">Enum Values (comma separated):</span>
                      <input
                        value={formatEnumValues(field.node as any)}
                        onChange={(event) =>
                          updateField(fieldIndex, (targetField) => {
                            if (
                              targetField.node.type === 'string' ||
                              targetField.node.type === 'number' ||
                              targetField.node.type === 'integer'
                            ) {
                              targetField.node.enumValues = parseEnumInput(event.target.value, targetField.node.type);
                            }
                          })
                        }
                        placeholder="a, b, c"
                      />
                    </div>
                  ) : null}

                  {field.node.type === 'array' ? (
                    <div className="schema-json-field-enum-row">
                      <span className="schema-json-enum-label">Array Item type:</span>
                      <select
                        value={
                          field.node.items.type === 'array' || field.node.items.type === 'object'
                            ? 'string'
                            : field.node.items.type
                        }
                        onChange={(event) =>
                          updateField(fieldIndex, (targetField) => {
                            if (targetField.node.type === 'array') {
                              const nextType = event.target.value as SchemaNodeType;
                              targetField.node.items = createSchemaNodeForType(
                                nextType === 'array' || nextType === 'object' ? 'string' : nextType
                              );
                            }
                          })
                        }
                      >
                        {arrayItemTypeOptions.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {field.node.type === 'object' ? (
                    <section className="schema-children">
                      <SchemaNodeEditor
                        node={field.node}
                        onChange={(nextNode) =>
                          updateField(fieldIndex, (targetField) => {
                            targetField.node = nextNode;
                          })
                        }
                        depth={depth + 1}
                        progressive={progressive}
                        hideObjectAdditionalProperties={hideObjectAdditionalProperties}
                        hideFieldConstraintsAndExample={hideFieldConstraintsAndExample}
                        hideNullableAndDefault={hideNullableAndDefault}
                        defaultFieldRequired={defaultFieldRequired}
                      />
                    </section>
                  ) : null}
                </section>
              ))
            )}

            <div className="schema-json-line schema-json-actions schema-json-indented">
              <button
                type="button"
                onClick={() =>
                  updateNode((draft) => {
                    if (draft.type === 'object') {
                      draft.properties.push(createDefaultField(defaultFieldRequired));
                    }

                    return draft;
                  })
                }
              >
                Add field
              </button>
            </div>

            <div className="schema-json-line schema-json-brace">{'}'}</div>
          </section>
        </div>

        {activeField ? (
          <ModalShell
            onClose={closeFieldSettings}
            size="default"
          >
            <section className="panel compact-panel">
              <h3>Field Settings: {activeField.key || 'field'}</h3>
              <div className="schema-grid">
                <label>
                  <span className="label-with-help">
                    Field Description (Optional)
                    <button
                      type="button"
                      className="field-help-btn"
                      onClick={() => setActiveFieldHelpTopic('description')}
                      aria-label="Field description help"
                    >
                      ?
                    </button>
                  </span>
                  <input
                    value={fieldSettingsDraft?.description ?? activeField.node.description ?? ''}
                    onChange={(event) => updateFieldSettingsDraft((draft) => {
                      draft.description = event.target.value;
                    })}
                  />
                </label>
                <label className="checkbox-label schema-checkbox">
                  <input
                    type="checkbox"
                    checked={fieldSettingsDraft?.required ?? activeField.required}
                    onChange={(event) => updateFieldSettingsDraft((draft) => {
                      draft.required = event.target.checked;
                    })}
                  />
                  <span className="label-with-help">
                    Required
                    <button
                      type="button"
                      className="field-help-btn"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setActiveFieldHelpTopic('required');
                      }}
                      aria-label="Required help"
                    >
                      ?
                    </button>
                  </span>
                </label>
                {!hideNullableAndDefault ? (
                  <label className="checkbox-label schema-checkbox">
                    <input
                      type="checkbox"
                      checked={fieldSettingsDraft?.nullable ?? Boolean(activeField.node.nullable)}
                      onChange={(event) => updateFieldSettingsDraft((draft) => {
                        draft.nullable = event.target.checked;
                      })}
                    />
                    Nullable
                  </label>
                ) : null}
                {!hideFieldConstraintsAndExample ? (
                  <>
                    <label>
                      <span className="label-with-help">
                        Field Constraints (Optional)
                        <button
                          type="button"
                          className="field-help-btn"
                          onClick={() => setActiveFieldHelpTopic('constraints')}
                          aria-label="Field constraints help"
                        >
                          ?
                        </button>
                      </span>
                      <input
                        value={fieldSettingsDraft?.constraints ?? activeField.node.constraints ?? ''}
                        onChange={(event) => updateFieldSettingsDraft((draft) => {
                          draft.constraints = event.target.value;
                        })}
                      />
                    </label>
                    <label>
                      <span className="label-with-help">
                        Field Example (Optional)
                        <button
                          type="button"
                          className="field-help-btn"
                          onClick={() => setActiveFieldHelpTopic('example')}
                          aria-label="Field example help"
                        >
                          ?
                        </button>
                      </span>
                      <input
                        value={
                          fieldSettingsDraft?.example ??
                          (activeField.node.example === undefined || activeField.node.example === null
                            ? ''
                            : String(activeField.node.example))
                        }
                        onChange={(event) => updateFieldSettingsDraft((draft) => {
                          draft.example = event.target.value;
                        })}
                      />
                    </label>
                  </>
                ) : null}
                {!hideNullableAndDefault ? (
                  <label>
                    Default Value
                    <input
                      value={
                        fieldSettingsDraft?.defaultValue ??
                        (activeField.node.default === undefined || activeField.node.default === null
                          ? ''
                          : String(activeField.node.default))
                      }
                      onChange={(event) => updateFieldSettingsDraft((draft) => {
                        draft.defaultValue = event.target.value;
                      })}
                    />
                  </label>
                ) : null}
              </div>
              <div className="row-actions schema-field-settings-actions">
                <button type="button" onClick={saveFieldSettings}>
                  Save
                </button>
              </div>
            </section>
          </ModalShell>
        ) : null}
        {activeFieldHelp ? (
          <ModalShell onClose={() => setActiveFieldHelpTopic(null)} size="default">
            <section className="panel compact-panel">
              <h3>{activeFieldHelp.title}</h3>
              <p className="meta-line">{activeFieldHelp.description}</p>
              <p className="meta-line">{activeFieldHelp.example}</p>
            </section>
          </ModalShell>
        ) : null}
      </section>
    );
  }

  return (
    <section className={rootClassName}>
      {title ? <h5>{title}</h5> : null}

      <div className="schema-grid two-col">
        <label>
          Type
          <select value={node.type} onChange={(event) => handleTypeChange(event.target.value)} disabled={disableTypeChange}>
            {schemaNodeTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        Field Description (Optional)
        <input
          value={node.description ?? ''}
          onChange={(event) =>
            updateNode((draft) => {
              draft.description = toOptionalString(event.target.value);
              return draft;
            })
          }
          placeholder="Field description"
        />
      </label>

      {progressive ? (
        <details className="schema-advanced">
          <summary>Add option / constraint</summary>
          <div className="schema-grid">{advancedOptions}</div>
        </details>
      ) : (
        <div className="schema-grid">{advancedOptions}</div>
      )}

      {node.type === 'array' ? (
        <section className="schema-children">
          <SchemaNodeEditor
            node={node.items}
            onChange={(nextItemNode) =>
              updateNode((draft) => {
                if (draft.type === 'array') {
                  draft.items = nextItemNode;
                }

                return draft;
              })
            }
            title="Array Item Schema"
            depth={depth + 1}
            progressive={progressive}
            hideFieldConstraintsAndExample={hideFieldConstraintsAndExample}
            hideNullableAndDefault={hideNullableAndDefault}
            defaultFieldRequired={defaultFieldRequired}
          />
        </section>
      ) : null}

      {node.type === 'string' || node.type === 'number' || node.type === 'integer' ? (
        <section className="schema-children">
          {progressive ? (
            <details className="schema-advanced">
              <summary>Add option / constraint</summary>
              <label>
                Enum Values (comma separated)
                <input
                  value={formatEnumValues(node)}
                  onChange={(event) =>
                    updateNode((draft) => {
                      if (draft.type === 'string' || draft.type === 'number' || draft.type === 'integer') {
                        draft.enumValues = parseEnumInput(event.target.value, draft.type);
                      }

                      return draft;
                    })
                  }
                  placeholder={node.type === 'string' ? 'low, medium, high' : '1, 2, 3'}
                />
              </label>
            </details>
          ) : (
            <label>
              Enum Values (comma separated)
              <input
                value={formatEnumValues(node)}
                onChange={(event) =>
                  updateNode((draft) => {
                    if (draft.type === 'string' || draft.type === 'number' || draft.type === 'integer') {
                      draft.enumValues = parseEnumInput(event.target.value, draft.type);
                    }

                    return draft;
                  })
                }
                placeholder={node.type === 'string' ? 'low, medium, high' : '1, 2, 3'}
              />
            </label>
          )}
        </section>
      ) : null}
    </section>
  );
}
