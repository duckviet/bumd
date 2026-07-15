import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { DEPLOY_STORE, type DeployStore } from "../../versions/deploy-ports.js";
import { TryItOutService } from "../../try-it-out/try-it-out.service.js";
import {
  TestWorkflowRunStatus,
  TestWorkflowStepStatus,
  TestWorkflowErrorCode,
  TestWorkflowNodePhase,
  TerminalRunStatuses,
  type TestWorkflowNode,
} from "../test-workflow-types.js";
import { TestEnvironmentsService } from "../test-environments.service.js";
import { buildTopologicalOrder, getDescendants } from "./test-workflow-graph.js";
import { classifyWorkflowRunError } from "./test-workflow-error-classifier.js";
import { parseAndValidateDefinition } from "../test-workflow-definition.schema.js";
import {
  TestWorkflowRunStore,
  type SnapshotWorkflowRunRecord,
} from "./test-workflow-run-store.js";
import { TestWorkflowNodeRunner } from "./test-workflow-node-runner.js";

const RUN_TIMEOUT_MINUTES = 10;

function databaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

export type TestWorkflowJobData = {
  readonly runId: string;
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
};

type RunOutcome = {
  readonly status: TestWorkflowRunStatus;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
};

@Injectable()
export class TestWorkflowRunnerService implements OnModuleDestroy {
  private readonly store: TestWorkflowRunStore;
  private readonly nodeRunner: TestWorkflowNodeRunner;
  private readonly logger = new Logger(TestWorkflowRunnerService.name);

  public constructor(
    @Inject(DEPLOY_STORE) private readonly deployStore: DeployStore,
    private readonly tryItOut: TryItOutService,
    private readonly envService: TestEnvironmentsService,
  ) {
    this.store = new TestWorkflowRunStore(databaseUrl());
    this.nodeRunner = new TestWorkflowNodeRunner(this.store, this.tryItOut);
  }

  public async onModuleDestroy(): Promise<void> {
    await this.store.close();
  }

  public async process(data: TestWorkflowJobData): Promise<void> {
    const run = await this.store.loadRun(data.runId);

    if (TerminalRunStatuses.has(run.status)) {
      this.logger.warn(`Run ${run.id} is already terminal (${run.status}), skipping`);
      return;
    }

    await this.store.markRunRunning(run.id);
    const startedAt = Date.now();

    try {
      const outcome = await this.executeRun(run, data);
      await this.store.finalizeRun(run.id, { ...outcome, durationMs: Date.now() - startedAt });
    } catch (error) {
      const classified = classifyWorkflowRunError(error);
      await this.store.finalizeRun(run.id, {
        status: TestWorkflowRunStatus.Failed,
        durationMs: Date.now() - startedAt,
        errorCode: classified.code,
        errorMessage: classified.message,
      });
      this.logger.error(`Run ${run.id} failed: ${classified.message}`);
    }
  }

  private async executeRun(
    run: SnapshotWorkflowRunRecord,
    data: TestWorkflowJobData,
  ): Promise<RunOutcome> {
    const definition = parseAndValidateDefinition(run.definitionSnapshotJson);
    const nodeOrder = buildTopologicalOrder(
      definition.nodes.map((node) => node.id),
      definition.edges,
    );
    const nodesById = new Map(definition.nodes.map((node) => [node.id, node]));
    const nodesByPhase = {
      setup: this.nodesForPhase(nodeOrder, nodesById, TestWorkflowNodePhase.Setup),
      test: this.nodesForPhase(nodeOrder, nodesById, TestWorkflowNodePhase.Test),
      teardown: this.nodesForPhase(nodeOrder, nodesById, TestWorkflowNodePhase.Teardown),
    };
    let envValues: Record<string, string> = {};
    let secretKeys: ReadonlySet<string> = new Set();
    if (run.environmentId) {
      const environmentContext = await this.envService.loadRunEnvironmentContext({
        organizationId: run.organizationId,
        docId: run.docId,
        branchId: run.branchId,
        environmentId: run.environmentId,
        environmentSnapshotJson: run.environmentSnapshotJson,
      });
      envValues = { ...environmentContext.values };
      secretKeys = environmentContext.secretKeys;
    }
    const secretValues = new Set(
      Object.entries(envValues)
        .filter(([key]) => secretKeys.has(key))
        .map(([, value]) => value),
    );
    const failedNodes = new Set<string>();
    const accumulatedVars: Record<string, unknown> = {};
    let setupFailed = false;
    let testFailed = false;
    let teardownFailed = false;
    let canceled = false;

    for (const node of nodesByPhase.setup) {
      if (await this.cancelRequested(run.id)) {
        canceled = true;
        break;
      }
      const result = await this.nodeRunner.executeOrSkipBlocked({
        run,
        data,
        node,
        definition,
        state: { failedNodes, accumulatedVars },
        environment: { values: envValues, secretKeys, secretValues },
      });
      if (result === "failed") setupFailed = true;
    }

    if (canceled) {
      await this.markQueuedNodes(run.id, [...nodesByPhase.setup, ...nodesByPhase.test], TestWorkflowStepStatus.Canceled);
    } else if (setupFailed) {
      await this.markQueuedNodes(run.id, nodesByPhase.test, TestWorkflowStepStatus.Skipped);
    } else {
      const blockedTests = new Set<string>();
      for (const node of nodesByPhase.test) {
        if (await this.cancelRequested(run.id)) {
          canceled = true;
          break;
        }
        if (blockedTests.has(node.id)) {
          await this.store.markStepStatus(run.id, node, TestWorkflowStepStatus.Skipped);
          continue;
        }
        const result = await this.nodeRunner.executeOrSkipBlocked({
          run,
          data,
          node,
          definition,
          state: { failedNodes, accumulatedVars },
          environment: { values: envValues, secretKeys, secretValues },
        });
        if (result === "failed") {
          testFailed = true;
          for (const descendant of getDescendants(node.id, definition.edges)) {
            blockedTests.add(descendant);
          }
        }
      }
      if (canceled) {
        await this.markQueuedNodes(run.id, nodesByPhase.test, TestWorkflowStepStatus.Canceled);
      }
    }

    canceled = canceled || await this.cancelRequested(run.id);
    for (const node of nodesByPhase.teardown) {
      const result = await this.nodeRunner.executeTeardown({
        run,
        data,
        node,
        definition,
        state: { failedNodes, accumulatedVars },
        environment: { values: envValues, secretKeys, secretValues },
      });
      if (result === "failed") teardownFailed = true;
      canceled = canceled || await this.cancelRequested(run.id);
    }

    if (canceled) return { status: TestWorkflowRunStatus.Canceled, errorCode: null, errorMessage: null };
    if (setupFailed || testFailed) {
      return {
        status: TestWorkflowRunStatus.Failed,
        errorCode: TestWorkflowErrorCode.RunFailed,
        errorMessage: "One or more setup or test steps failed",
      };
    }
    if (teardownFailed) {
      return {
        status: TestWorkflowRunStatus.Failed,
        errorCode: "TEARDOWN_FAILED",
        errorMessage: "One or more teardown steps failed",
      };
    }
    return { status: TestWorkflowRunStatus.Succeeded, errorCode: null, errorMessage: null };
  }

  private nodesForPhase(
    nodeOrder: readonly string[],
    nodesById: ReadonlyMap<string, TestWorkflowNode>,
    phase: TestWorkflowNode["phase"],
  ): readonly TestWorkflowNode[] {
    return nodeOrder.flatMap((nodeId) => {
      const node = nodesById.get(nodeId);
      return node?.phase === phase ? [node] : [];
    });
  }

  private async cancelRequested(runId: string): Promise<boolean> {
    return (await this.store.loadRun(runId)).cancelRequestedAt !== null;
  }

  private async markQueuedNodes(
    runId: string,
    nodes: readonly TestWorkflowNode[],
    status: typeof TestWorkflowStepStatus.Canceled | typeof TestWorkflowStepStatus.Skipped,
  ): Promise<void> {
    await this.store.markQueuedNodes(runId, nodes, status);
  }

  // ─── Reaper ──────────────────────────────────────────────────────────────────

  public async reaperSweep(): Promise<void> {
    const cutoff = new Date(Date.now() - RUN_TIMEOUT_MINUTES * 60 * 1000);
    const runIds = await this.store.failStaleRuns(cutoff, TestWorkflowErrorCode.WorkerInterrupted);
    if (runIds.length > 0) {
      this.logger.warn(`Reaper marked ${runIds.length} stale run(s) as failed: ${runIds.join(", ")}`);
    }
  }
}
