import { DiffChangeKind, DiffEngineClassification, type DiffChange, type DiffEngineResult } from "./types.js";

export function renderMarkdown(classification: DiffEngineClassification, changes: readonly DiffChange[]): string {
  if (classification === DiffEngineClassification.None) {
    return "## No functional changes\n\nNo functional OpenAPI changes were detected.";
  }
  return renderGroupedMarkdown(changes);
}

function renderGroupedMarkdown(changes: readonly DiffChange[]): string {
  const breakingChanges = changes.filter((change) => change.severity === DiffEngineClassification.Breaking);
  const warningChanges = changes.filter((change) => change.severity === DiffEngineClassification.Warning);
  const sections = [
    renderSection("Breaking changes", breakingChanges),
    renderSection("Added operations", changes.filter((change) => change.kind === DiffChangeKind.AddedEndpoint)),
    renderSection("Changed operations", changes.filter((change) => changedOperationKinds.has(change.kind))),
    renderSection("Removed operations", changes.filter((change) => change.kind === DiffChangeKind.RemovedEndpoint)),
    renderSection("Unknown changes", warningChanges),
  ].filter((section) => section.length > 0);
  return sections.join("\n\n");
}

export function initialDiff(): DiffEngineResult {
  return {
    classification: DiffEngineClassification.None,
    hasBreaking: false,
    diffJson: { changes: [] },
    markdown: "## Initial version\n\nNo previous version exists on this branch.",
  };
}

const changedOperationKinds = new Set<DiffChangeKind>([
  DiffChangeKind.AddedRequiredParameter,
  DiffChangeKind.ResponseTypeChanged,
  DiffChangeKind.AddedOptionalField,
]);

function renderSection(title: string, changes: readonly DiffChange[]): string {
  if (changes.length === 0) {
    return "";
  }
  const lines = changes.map((change) => `- ${change.message}`);
  return [`## ${title}`, ...lines].join("\n");
}
