import type { TryItOutService } from "../../try-it-out/try-it-out.service.js";
import {
  TestWorkflowErrorCode,
  TestWorkflowStepStatus,
  TerminalStepStatuses,
  type TestWorkflowDefinition,
  type TestWorkflowNode,
} from "../test-workflow-types.js";
import { executeWorkflowStep, type StepExecutionResult } from "./test-workflow-step-executor.js";
import type { SnapshotWorkflowRunRecord, TestWorkflowRunStore } from "./test-workflow-run-store.js";
import type { TestWorkflowJobData } from "./test-workflow-runner.service.js";

export type NodeOutcome = "succeeded" | "failed" | "skipped";

export type NodeExecutionInput = {
  readonly run: SnapshotWorkflowRunRecord;
  readonly data: TestWorkflowJobData;
  readonly node: TestWorkflowNode;
  readonly definition: TestWorkflowDefinition;
  readonly state: {
    readonly failedNodes: Set<string>;
    readonly accumulatedVars: Record<string, unknown>;
  };
  readonly environment: {
    readonly values: Record<string, string>;
    readonly secretKeys: ReadonlySet<string>;
    readonly secretValues: ReadonlySet<string>;
  };
};

export class TestWorkflowNodeRunner {
  public constructor(
    private readonly store: TestWorkflowRunStore,
    private readonly tryItOut: Pick<TryItOutService, "execute">,
  ) {}

  public async executeOrSkipBlocked(input: NodeExecutionInput): Promise<NodeOutcome> {
    const step = await this.store.loadStep(input.run.id, input.node.id);
    if (TerminalStepStatuses.has(step.status)) {
      return step.status === TestWorkflowStepStatus.Failed ? "failed" : "skipped";
    }
    const failedDependency = input.definition.edges.some(
      (edge) => edge.target === input.node.id && input.state.failedNodes.has(edge.source),
    );
    if (failedDependency) {
      await this.store.markStepStatus(input.run.id, input.node, TestWorkflowStepStatus.Skipped);
      return "skipped";
    }
    return this.execute(input);
  }

  public async executeTeardown(input: NodeExecutionInput): Promise<NodeOutcome> {
    const step = await this.store.loadStep(input.run.id, input.node.id);
    if (TerminalStepStatuses.has(step.status)) {
      return step.status === TestWorkflowStepStatus.Failed ? "failed" : "skipped";
    }
    const failedDependency = input.definition.edges.some(
      (edge) => edge.target === input.node.id && input.state.failedNodes.has(edge.source),
    );
    if (failedDependency) {
      const result: StepExecutionResult = {
        kind: "failed",
        requestJson: null,
        responseJson: null,
        assertionsJson: null,
        exportsJson: null,
        inputsJson: null,
        durationMs: 0,
        errorCode: TestWorkflowErrorCode.RunFailed,
        errorMessage: "A teardown dependency failed",
      };
      await this.store.persistStep(input.run.id, input.node, result);
      input.state.failedNodes.add(input.node.id);
      return "failed";
    }
    return this.execute(input);
  }

  private async execute(input: NodeExecutionInput): Promise<NodeOutcome> {
    await this.store.markStepStatus(input.run.id, input.node, TestWorkflowStepStatus.Running);
    const result = await executeWorkflowStep({
      node: input.node,
      route: {
        orgSlug: input.data.orgSlug,
        docSlug: input.data.docSlug,
        branchSlug: input.data.branchSlug,
        versionId: input.run.versionId,
      },
      context: {
        vars: input.state.accumulatedVars,
        env: input.environment.values,
        data: input.definition.context.testData,
        secretKeys: input.environment.secretKeys,
        secretValues: input.environment.secretValues,
      },
      tryItOut: this.tryItOut,
    });
    await this.store.persistStep(input.run.id, input.node, result);
    switch (result.kind) {
      case "failed":
        input.state.failedNodes.add(input.node.id);
        return "failed";
      case "succeeded":
        Object.assign(input.state.accumulatedVars, result.runtimeExports);
        return "succeeded";
      default:
        return assertNever(result);
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected step result: ${JSON.stringify(value)}`);
}
