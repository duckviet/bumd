import type {
  TestWorkflowNodePhase,
  TestWorkflowRunDetailDto,
  TestWorkflowStepRunDto,
} from "@/entities/test-workflow";

const PHASE_ORDER: readonly TestWorkflowNodePhase[] = ["setup", "test", "teardown"];

type StepError = NonNullable<TestWorkflowStepRunDto["error"]>;

export type RunPhaseGroup = {
  readonly phase: TestWorkflowNodePhase;
  readonly steps: readonly TestWorkflowStepRunDto[];
};

export type RunErrorSummary = {
  readonly primaryError: TestWorkflowRunDetailDto["error"];
  readonly teardownFailures: readonly {
    readonly nodeId: string;
    readonly error: StepError;
  }[];
};

export function groupRunStepsByPhase(
  steps: readonly TestWorkflowStepRunDto[],
): readonly RunPhaseGroup[] {
  return PHASE_ORDER.map((phase) => ({
    phase,
    steps: steps.filter((step) => step.phase === phase),
  })).filter((group) => group.steps.length > 0);
}

export function summarizeRunErrors(
  run: Pick<TestWorkflowRunDetailDto, "error" | "steps">,
): RunErrorSummary {
  return {
    primaryError: run.error?.code === "TEARDOWN_FAILED" ? null : run.error,
    teardownFailures: run.steps.flatMap((step) =>
      step.phase === "teardown" && step.error !== null
        ? [{ nodeId: step.nodeId, error: step.error }]
        : [],
    ),
  };
}
