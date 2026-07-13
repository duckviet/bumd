"use client";

import { useState, useEffect } from "react";
import type { TestEnvironmentDto } from "@/entities/test-workflow";
import {
  createEnvironment,
  updateEnvironment,
  deleteEnvironment,
} from "@/shared/api/test-workflows-client";
import {
  DashboardButton,
  fieldClassName,
  FormField,
  ModalActions,
  ModalHeader,
} from "@/shared/ui/dashboard-primitives";

type EnvironmentsModalProps = {
  readonly org: string;
  readonly doc: string;
  readonly branch: string;
  readonly environments: readonly TestEnvironmentDto[];
  readonly onClose: () => void;
  readonly onEnvironmentsChanged: (envs: TestEnvironmentDto[]) => void;
};

type EditableVariable = {
  readonly id?: string | undefined;
  readonly key: string;
  readonly value: string;
  readonly secret: boolean;
  readonly isNew?: boolean | undefined;
  readonly isModified?: boolean | undefined;
  readonly isRemoved?: boolean | undefined;
};

export function EnvironmentsModal({
  org,
  doc,
  branch,
  environments,
  onClose,
  onEnvironmentsChanged,
}: EnvironmentsModalProps) {
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(
    environments.length > 0 ? environments[0]!.id : null
  );

  // Editing state
  const [envName, setEnvName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [variables, setVariables] = useState<readonly EditableVariable[]>([]);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedEnv = environments.find((e) => e.id === selectedEnvId);

  // Sync state when selection changes
  useEffect(() => {
    if (isCreatingNew) {
      setEnvName("");
      setIsDefault(false);
      setVariables([]);
    } else if (selectedEnv) {
      setEnvName(selectedEnv.name);
      setIsDefault(selectedEnv.isDefault);
      setVariables(
        selectedEnv.variables.map((v) => ({
          id: v.id,
          key: v.key,
          value: "", // Write-only placeholder
          secret: v.secret,
        }))
      );
      setError(null);
    } else {
      setEnvName("");
      setIsDefault(false);
      setVariables([]);
    }
  }, [selectedEnvId, selectedEnv, isCreatingNew]);

  const handleSelectEnv = (id: string) => {
    setIsCreatingNew(false);
    setSelectedEnvId(id);
  };

  const handleStartCreate = () => {
    setIsCreatingNew(true);
    setSelectedEnvId(null);
  };

  const handleAddVariable = () => {
    setVariables((prev) => [
      ...prev,
      { key: "", value: "", secret: true, isNew: true },
    ]);
  };

  const handleRemoveVariable = (index: number) => {
    setVariables((prev) =>
      prev.map((v, idx) => {
        if (idx !== index) return v;
        if (v.isNew) return null; // Remove entirely if never saved
        return { ...v, isRemoved: true }; // Mark for backend removal
      }).filter((v): v is EditableVariable => v !== null)
    );
  };

  const handleVariableChange = (
    index: number,
    field: "key" | "value" | "secret",
    val: string | boolean
  ) => {
    setVariables((prev) =>
      prev.map((v, idx) => {
        if (idx !== index) return v;
        return {
          ...v,
          [field]: val,
          isModified: !v.isNew ? true : undefined,
        };
      })
    );
  };

  const handleSave = async () => {
    const trimmedName = envName.trim();
    if (!trimmedName) {
      setError("Environment name is required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (isCreatingNew) {
        // Create new
        const newEnv = await createEnvironment({
          orgSlug: org,
          docSlug: doc,
          branchSlug: branch,
          body: {
            name: trimmedName,
            isDefault,
            variables: variables
              .filter((v) => !v.isRemoved && v.key.trim() !== "")
              .map((v) => ({
                key: v.key.trim(),
                value: v.value,
                secret: v.secret,
              })),
          },
        });
        const updatedEnvs = [...environments, newEnv];
        onEnvironmentsChanged(updatedEnvs);
        setIsCreatingNew(false);
        setSelectedEnvId(newEnv.id);
      } else if (selectedEnvId) {
        // Update existing
        const varsPayload = variables.map((v) => {
          if (v.isRemoved) {
            return { key: v.key, remove: true };
          }
          if (v.isNew) {
            return { key: v.key.trim(), value: v.value, secret: v.secret };
          }
          // Existing variable: only send value if it was modified (typed into)
          const item: { key: string; value?: string; secret?: boolean; remove?: boolean } = {
            key: v.key.trim(),
            secret: v.secret,
          };
          if (v.isModified && v.value !== "") {
            item.value = v.value;
          }
          return item;
        }).filter((v) => v.key !== "");

        const updatedEnv = await updateEnvironment({
          orgSlug: org,
          docSlug: doc,
          branchSlug: branch,
          environmentId: selectedEnvId,
          body: {
            name: trimmedName,
            isDefault,
            variables: varsPayload,
          },
        });

        const updatedEnvs = environments.map((e) =>
          e.id === selectedEnvId ? updatedEnv : e
        );
        onEnvironmentsChanged(updatedEnvs);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An error occurred while saving."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEnv = async () => {
    if (!selectedEnvId || isCreatingNew) return;
    if (!confirm(`Are you sure you want to delete environment "${envName}"?`)) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await deleteEnvironment({
        orgSlug: org,
        docSlug: doc,
        branchSlug: branch,
        environmentId: selectedEnvId,
      });

      const updatedEnvs = environments.filter((e) => e.id !== selectedEnvId);
      onEnvironmentsChanged(updatedEnvs);
      if (updatedEnvs.length > 0) {
        setSelectedEnvId(updatedEnvs[0]!.id);
      } else {
        setSelectedEnvId(null);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An error occurred while deleting."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/50 backdrop-blur-sm">
      <div className="flex h-[550px] w-full max-w-4xl flex-col rounded-lg border border-chalk bg-paper shadow-2xl overflow-hidden">
        {/* Header */}
        <ModalHeader onClose={onClose}>Configure Environments</ModalHeader>

        {/* Content Body */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar - Env List */}
          <div className="w-1/3 border-r border-chalk bg-fog p-4 flex flex-col justify-between">
            <div className="flex flex-col gap-2 overflow-y-auto">
              <span className="text-[10px] uppercase font-bold text-slate tracking-wider">Environments</span>
              {environments.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => handleSelectEnv(e.id)}
                  className={`w-full text-left rounded px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
                    e.id === selectedEnvId && !isCreatingNew
                      ? "bg-carbon text-paper shadow-md"
                      : "bg-white text-carbon hover:bg-chalk border border-chalk"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate max-w-[150px]">{e.name}</span>
                    {e.isDefault && (
                      <span className="text-[9px] bg-signal-orange text-paper px-1.5 py-0.5 rounded-full scale-90">
                        Default
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleStartCreate}
              className={`w-full text-center rounded border border-dashed py-2 text-xs font-bold transition-all cursor-pointer ${
                isCreatingNew
                  ? "border-signal-orange text-signal-orange bg-amber-50"
                  : "border-slate text-slate hover:border-carbon hover:text-carbon bg-white"
              }`}
            >
              + Create Environment
            </button>
          </div>

          {/* Form - Details & Vars */}
          <div className="flex-1 p-6 flex flex-col min-h-0 overflow-y-auto">
            {(!selectedEnvId && !isCreatingNew) ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate text-xs italic">
                No environment selected. Create one to configure environment variables.
              </div>
            ) : (
              <div className="flex flex-col gap-4 flex-1">
                {/* Env Name & Default */}
                <div className="flex items-end justify-between gap-4">
                  <div className="w-2/3">
                    <FormField label="Environment Name">
                      <input
                        type="text"
                        className={fieldClassName}
                        value={envName}
                        onChange={(e) => setEnvName(e.target.value)}
                        placeholder="Production, Staging, Local..."
                      />
                    </FormField>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer pb-2 text-xs text-carbon font-semibold select-none">
                    <input
                      type="checkbox"
                      checked={isDefault}
                      onChange={(e) => setIsDefault(e.target.checked)}
                      className="rounded border-chalk text-signal-orange focus:ring-signal-orange w-4 h-4 cursor-pointer"
                    />
                    Set as default environment
                  </label>
                </div>

                {/* Variables Header */}
                <div className="flex items-center justify-between border-b border-chalk pb-2">
                  <span className="text-xs font-bold text-carbon">Variables</span>
                  <button
                    type="button"
                    onClick={handleAddVariable}
                    className="text-[10px] font-bold text-signal-orange hover:opacity-80 cursor-pointer"
                  >
                    + Add Variable
                  </button>
                </div>

                {/* Variables List */}
                <div className="flex-1 overflow-y-auto flex flex-col gap-2 min-h-0 pr-1">
                  {variables.filter((v) => !v.isRemoved).length === 0 ? (
                    <span className="text-xs italic text-slate py-4">
                      No variables configured. Add keys like BASE_URL or API_TOKEN.
                    </span>
                  ) : (
                    variables.map((v, index) => {
                      if (v.isRemoved) return null;
                      return (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={v.key}
                            onChange={(e) =>
                              handleVariableChange(index, "key", e.target.value)
                            }
                            placeholder="Variable Key (e.g. BASE_URL)"
                            className="w-1/3 rounded border border-chalk bg-white px-2 py-1.5 focus:border-signal-orange focus:outline-none font-mono text-[11px]"
                          />
                          <input
                            type="text"
                            value={v.value}
                            onChange={(e) =>
                              handleVariableChange(index, "value", e.target.value)
                            }
                            placeholder={
                              v.isNew
                                ? "Value"
                                : v.secret
                                ? "•••••••• (Secret - type to overwrite)"
                                : "Type value to overwrite"
                            }
                            className="w-1/2 rounded border border-chalk bg-white px-2 py-1.5 focus:border-signal-orange focus:outline-none font-mono text-[11px]"
                          />
                          <label className="flex items-center gap-1 text-[10px] text-slate cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={v.secret}
                              onChange={(e) =>
                                handleVariableChange(index, "secret", e.target.checked)
                              }
                              className="rounded scale-75 border-chalk text-signal-orange focus:ring-signal-orange cursor-pointer"
                            />
                            Secret
                          </label>
                          <button
                            type="button"
                            onClick={() => handleRemoveVariable(index)}
                            className="text-slate hover:text-red-500 font-bold px-1 text-base cursor-pointer"
                          >
                            &times;
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Error Banner */}
                {error && (
                  <div className="bg-red-50 border border-red-100 rounded p-2.5 text-[11px] text-red-800">
                    {error}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between border-t border-chalk pt-4 mt-auto">
                  {!isCreatingNew && selectedEnvId ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleDeleteEnv}
                      className="text-xs font-bold text-red-500 hover:underline cursor-pointer disabled:opacity-50"
                    >
                      Delete Environment
                    </button>
                  ) : (
                    <div />
                  )}

                  <div className="flex gap-2">
                    <DashboardButton
                      disabled={saving}
                      onClick={onClose}
                      tone="secondary"
                    >
                      Close
                    </DashboardButton>
                    <DashboardButton
                      disabled={saving}
                      onClick={handleSave}
                    >
                      {saving ? "Saving..." : "Save changes"}
                    </DashboardButton>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
