import { DiffEngineClassification, type DiffChange, type DiffEngineResult } from "./types.js";

export function renderMarkdown(classification: DiffEngineClassification, changes: readonly DiffChange[]): string {
  if (classification === DiffEngineClassification.None) {
    return "## No functional changes\n\nNo functional OpenAPI changes were detected.";
  }

  const breakingChanges = changes.filter((change) => change.severity === DiffEngineClassification.Breaking);
  const nonBreakingChanges = changes.filter((change) => change.severity === DiffEngineClassification.NonBreaking);
  const warningChanges = changes.filter((change) => change.severity === DiffEngineClassification.Warning);
  const sections = [
    renderSection("Breaking changes", breakingChanges),
    renderSection("Warnings", warningChanges),
    renderSection("Non-breaking changes", nonBreakingChanges),
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

function renderSection(title: string, changes: readonly DiffChange[]): string {
  if (changes.length === 0) {
    return "";
  }
  const lines = changes.map((change) => `- ${change.message}`);
  return [`## ${title}`, ...lines].join("\n");
}
