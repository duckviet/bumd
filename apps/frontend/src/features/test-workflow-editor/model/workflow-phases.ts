import type { TestWorkflowNode, TestWorkflowNodePhase } from "@/entities/test-workflow";

type WorkflowPhaseOption = {
  readonly value: TestWorkflowNodePhase;
  readonly label: string;
  readonly description: string;
};

export const workflowPhases = [
  { value: "setup", label: "Setup", description: "Prepares shared state before test nodes run." },
  { value: "test", label: "Test", description: "Performs the main verification for this workflow." },
  { value: "teardown", label: "Teardown", description: "Attempts cleanup after setup and test work." },
] as const satisfies readonly WorkflowPhaseOption[];

const phaseOrder: Readonly<Record<TestWorkflowNodePhase, number>> = {
  setup: 0,
  test: 1,
  teardown: 2,
};

export function getPhaseConnectionError(
  nodes: readonly Pick<TestWorkflowNode, "id" | "phase">[],
  sourceId: string,
  targetId: string,
): string | null {
  const source = nodes.find((node) => node.id === sourceId);
  const target = nodes.find((node) => node.id === targetId);
  if (!source || !target) {
    return "This connection could not be validated. Refresh the workflow and try again.";
  }
  if (phaseOrder[source.phase] <= phaseOrder[target.phase]) {
    return null;
  }
  return `A ${source.phase} node cannot connect to an earlier ${target.phase} phase.`;
}

export function getPhaseBadgeClass(phase: TestWorkflowNodePhase): string {
  switch (phase) {
    case "setup":
      return "border-sienna-bronze/40 bg-fog text-sienna-bronze";
    case "test":
      return "border-signal-orange/40 bg-signal-orange/10 text-signal-orange";
    case "teardown":
      return "border-carbon/30 bg-chalk text-carbon";
  }
}
