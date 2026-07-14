import { Inject, Injectable, Logger } from "@nestjs/common";
import { Pool } from "pg";
import { parse as parseYaml } from "yaml";
import { DEPLOY_STORE, type DeployStore } from "../../versions/deploy-ports.js";
import { TryItOutService } from "../../try-it-out/try-it-out.service.js";
import {
  TestWorkflowRunStatus,
  TestWorkflowStepStatus,
  TestWorkflowErrorCode,
  TerminalStepStatuses,
  type TestWorkflowDefinition,
  type TestWorkflowNode,
  type TestWorkflowRunRecord,
  type TestWorkflowStepRunRecord,
} from "../test-workflow-types.js";
import { TestEnvironmentsService } from "../test-environments.service.js";
import { buildTopologicalOrder, getDescendants } from "./test-workflow-graph.js";
import {
  collectedRefsToInputs,
  interpolate,
  type CollectedRef,
  type InterpolationContext,
} from "./test-workflow-template.js";
import { evaluateAssertions } from "./test-workflow-assertions.js";
import { extractExports } from "./test-workflow-exports.js";
import { redactSensitiveHeaders, redactSecretValues, truncateBody } from "./test-workflow-redaction.js";
import { TestWorkflowError } from "../test-workflow-errors.js";
import {
  classifyWorkflowRunError,
  classifyWorkflowStepError,
} from "./test-workflow-error-classifier.js";

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

type SnapshotWorkflowRunRecord = TestWorkflowRunRecord & {
  readonly environmentSnapshotJson: unknown | null;
};

@Injectable()
export class TestWorkflowRunnerService {
  private readonly pool: Pool;
  private readonly logger = new Logger(TestWorkflowRunnerService.name);

  public constructor(
    @Inject(DEPLOY_STORE) private readonly deployStore: DeployStore,
    private readonly tryItOut: TryItOutService,
    private readonly envService: TestEnvironmentsService,
  ) {
    this.pool = new Pool({ connectionString: databaseUrl() });
  }

  public async process(data: TestWorkflowJobData): Promise<void> {
    const run = await this.loadRun(data.runId);

    if (TerminalStepStatuses.has(run.status as unknown as typeof TestWorkflowStepStatus[keyof typeof TestWorkflowStepStatus])) {
      this.logger.warn(`Run ${run.id} is already terminal (${run.status}), skipping`);
      return;
    }

    await this.markRunStatus(run.id, TestWorkflowRunStatus.Running);
    const startedAt = Date.now();

    try {
      await this.executeRun(run, data);
      const durationMs = Date.now() - startedAt;
      await this.finalizeRun(run.id, TestWorkflowRunStatus.Succeeded, durationMs, null, null);
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const classified = classifyWorkflowRunError(err);
      await this.finalizeRun(
        run.id,
        TestWorkflowRunStatus.Failed,
        durationMs,
        classified.code,
        classified.message,
      );
      this.logger.error(`Run ${run.id} failed: ${classified.message}`);
    }
  }

  private async executeRun(run: SnapshotWorkflowRunRecord, data: TestWorkflowJobData): Promise<void> {
    const definition = run.definitionSnapshotJson as TestWorkflowDefinition;
    const nodeOrder = buildTopologicalOrder(
      definition.nodes.map((n) => n.id),
      definition.edges,
    );

    // Load environment variables
    let envValues: Record<string, string> = {};
    let secretKeys = new Set<string>();
    let secretValueSet = new Set<string>();
    if (run.environmentId) {
      const environmentContext = await this.envService.loadRunEnvironmentContext({
        organizationId: run.organizationId,
        docId: run.docId,
        branchId: run.branchId,
        environmentId: run.environmentId,
        environmentSnapshotJson: run.environmentSnapshotJson,
      });
      envValues = { ...environmentContext.values };
      secretKeys = new Set(environmentContext.secretKeys);
      secretValueSet = new Set(Object.entries(envValues).filter(([key]) => secretKeys.has(key)).map(([, value]) => value));
    }

    const nodeById = new Map(definition.nodes.map((n) => [n.id, n]));
    const exportsByNode = new Map<string, Record<string, unknown>>();
    const failedNodes = new Set<string>();

    // Accumulated vars from all prior successful exports
    const accumulatedVars: Record<string, unknown> = {};

    for (const nodeId of nodeOrder) {
      const node = nodeById.get(nodeId)!;

      // ── §10.5.2 Step guard ──────────────────────────────────────────────────
      const step = await this.loadStep(run.id, nodeId);
      if (TerminalStepStatuses.has(step.status as typeof TestWorkflowStepStatus[keyof typeof TestWorkflowStepStatus])) {
        this.logger.warn(`Step ${nodeId} is already terminal (${step.status}), skipping`);
        continue;
      }

      // ── §10.6.3 Cancel check ────────────────────────────────────────────────
      const freshRun = await this.loadRun(run.id);
      if (freshRun.cancelRequestedAt !== null) {
        await this.cancelRemainingSteps(run.id, nodeOrder, failedNodes, new Set<string>([nodeId]));
        await this.finalizeRun(run.id, TestWorkflowRunStatus.Canceled, Date.now() - Date.now(), null, null);
        return;
      }

      // ── Fail-fast: skip if any ancestor failed ──────────────────────────────
      const hasFailedAncestor = definition.edges.some(
        (e) => e.target === nodeId && failedNodes.has(e.source),
      );
      if (hasFailedAncestor) {
        await this.markStepStatus(run.id, nodeId, TestWorkflowStepStatus.Skipped);
        failedNodes.add(nodeId);
        continue;
      }

      // ── Execute step ────────────────────────────────────────────────────────
      await this.markStepStatus(run.id, nodeId, TestWorkflowStepStatus.Running);
      const stepStartedAt = Date.now();

      try {
        const ctx: InterpolationContext = {
          vars: accumulatedVars,
          env: envValues,
          data: definition.context.testData,
          secretKeys,
        };
        const refs: CollectedRef[] = [];

        // Build resolved request
        const resolvedTemplate = interpolate(node.requestTemplate, ctx, refs) as {
          serverUrl?: string;
          pathParams?: Record<string, unknown>;
          query?: Record<string, unknown>;
          headers?: Record<string, unknown>;
          body?: unknown;
        };

        // Apply path params
        let resolvedPath = node.path;
        for (const [k, v] of Object.entries(resolvedTemplate.pathParams ?? {})) {
          resolvedPath = resolvedPath.replace(`{${k}}`, String(v));
        }

        // Build request snapshot (before execution, for logging)
        const requestSnapshot = {
          method: node.method,
          serverUrl: resolvedTemplate.serverUrl ?? "",
          path: resolvedPath,
          query: resolvedTemplate.query ?? {},
          headers: redactSensitiveHeaders(
            Object.fromEntries(
              Object.entries(resolvedTemplate.headers ?? {}).map(([k, v]) => [k, String(v)]),
            ),
          ),
          body: truncateBody(resolvedTemplate.body),
        };

        // Execute via TryItOutService (reusing SSRF guard, timeout, blocked headers)
        const response = await this.tryItOut.execute({
          orgSlug: data.orgSlug,
          docSlug: data.docSlug,
          branchSlug: data.branchSlug,
          versionId: run.versionId,
          body: {
            serverUrl: resolvedTemplate.serverUrl ?? "",
            method: node.method.toUpperCase(),
            path: resolvedPath,
            query: Object.fromEntries(
              Object.entries(resolvedTemplate.query ?? {}).map(([k, v]) => [k, String(v)]),
            ),
            headers: Object.fromEntries(
              Object.entries(resolvedTemplate.headers ?? {}).map(([k, v]) => [k, String(v)]),
            ),
            body: resolvedTemplate.body,
          },
        });

        const durationMs = Date.now() - stepStartedAt;

        const resolvedResponse = {
          status: response.status,
          headers: response.headers as Record<string, string>,
          body: parseResponseBody(response.body),
          durationMs,
        };

        // Evaluate assertions
        const assertionResults = evaluateAssertions(node.assertions, resolvedResponse);
        const failedAssertions = assertionResults.filter((a) => !a.passed);

        // Extract exports
        const exports = extractExports(node.exports, resolvedResponse);

        // Redact secret values from stored artifacts
        const redactedRequestSnapshot = redactSecretValues(requestSnapshot, secretValueSet);
        const redactedResponseBody = truncateBody(
          redactSecretValues(resolvedResponse.body, secretValueSet),
        );
        const redactedHeaders = redactSensitiveHeaders(
          Object.fromEntries(
            Object.entries(resolvedResponse.headers).map(([k, v]) => [k, String(v)]),
          ),
        );

        // Build inputs record
        const inputsRecord = collectedRefsToInputs(refs, envValues);

        if (failedAssertions.length > 0) {
          const firstFailed = failedAssertions[0]!;
          await this.persistStep(run.id, nodeId, {
            status: TestWorkflowStepStatus.Failed,
            requestJson: redactedRequestSnapshot,
            responseJson: { status: resolvedResponse.status, headers: redactedHeaders, body: redactedResponseBody },
            assertionsJson: assertionResults,
            exportsJson: exports,
            inputsJson: inputsRecord,
            durationMs,
            errorCode: TestWorkflowErrorCode.AssertionFailed,
            errorMessage: `Assertion "${firstFailed.id}" failed`,
          });
          failedNodes.add(nodeId);
          continue;
        }

        // Success
        exportsByNode.set(nodeId, exports);
        Object.assign(accumulatedVars, exports);

        await this.persistStep(run.id, nodeId, {
          status: TestWorkflowStepStatus.Succeeded,
          requestJson: redactedRequestSnapshot,
          responseJson: { status: resolvedResponse.status, headers: redactedHeaders, body: redactedResponseBody },
          assertionsJson: assertionResults,
          exportsJson: exports,
          inputsJson: inputsRecord,
          durationMs,
          errorCode: null,
          errorMessage: null,
        });
      } catch (err) {
        const durationMs = Date.now() - stepStartedAt;
        const classified = classifyWorkflowStepError(err);
        const errorMessage = redactSecretValues(classified.message, secretValueSet) as string;

        await this.persistStep(run.id, nodeId, {
          status: TestWorkflowStepStatus.Failed,
          requestJson: null,
          responseJson: null,
          assertionsJson: null,
          exportsJson: null,
          inputsJson: null,
          durationMs,
          errorCode: classified.code,
          errorMessage,
        });
        failedNodes.add(nodeId);
      }
    }

    // If any steps failed, mark run as failed
    if (failedNodes.size > 0) {
      throw new TestWorkflowError(
        TestWorkflowErrorCode.RunFailed,
        422,
        "One or more workflow steps failed",
      );
    }
  }

  // ─── Reaper ──────────────────────────────────────────────────────────────────

  public async reaperSweep(): Promise<void> {
    const cutoff = new Date(Date.now() - RUN_TIMEOUT_MINUTES * 60 * 1000);
    const result = await this.pool.query<{ id: string }>(
      `UPDATE "TestWorkflowRun"
       SET status = $1, "errorCode" = $2, "errorMessage" = $3, "finishedAt" = NOW(), "updatedAt" = NOW()
       WHERE status = $4 AND "updatedAt" < $5
       RETURNING id`,
      [
        TestWorkflowRunStatus.Failed,
        TestWorkflowErrorCode.WorkerInterrupted,
        "Worker was interrupted before completing the run.",
        TestWorkflowRunStatus.Running,
        cutoff,
      ],
    );
    if (result.rows.length > 0) {
      this.logger.warn(`Reaper marked ${result.rows.length} stale run(s) as failed: ${result.rows.map((r) => r.id).join(", ")}`);
    }
  }

  // ─── DB helpers ──────────────────────────────────────────────────────────────

  private async loadRun(runId: string): Promise<SnapshotWorkflowRunRecord> {
    const result = await this.pool.query<SnapshotWorkflowRunRecord>(
      `SELECT * FROM "TestWorkflowRun" WHERE id = $1 LIMIT 1`,
      [runId],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Run ${runId} not found`);
    return row;
  }

  private async loadStep(runId: string, nodeId: string): Promise<TestWorkflowStepRunRecord> {
    const result = await this.pool.query<TestWorkflowStepRunRecord>(
      `SELECT * FROM "TestWorkflowStepRun" WHERE "runId" = $1 AND "nodeId" = $2 LIMIT 1`,
      [runId, nodeId],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Step ${nodeId} not found for run ${runId}`);
    return row;
  }

  private async markRunStatus(runId: string, status: TestWorkflowRunStatus): Promise<void> {
    await this.pool.query(
      `UPDATE "TestWorkflowRun"
       SET status = $1, "startedAt" = COALESCE("startedAt", NOW()), "updatedAt" = NOW()
       WHERE id = $2`,
      [status, runId],
    );
  }

  private async finalizeRun(
    runId: string,
    status: TestWorkflowRunStatus,
    durationMs: number,
    errorCode: string | null,
    errorMessage: string | null,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE "TestWorkflowRun"
       SET status = $1, "finishedAt" = NOW(), "durationMs" = $2,
           "errorCode" = $3, "errorMessage" = $4, "updatedAt" = NOW()
       WHERE id = $5`,
      [status, durationMs, errorCode, errorMessage, runId],
    );
  }

  private async markStepStatus(
    runId: string,
    nodeId: string,
    status: TestWorkflowStepStatus,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE "TestWorkflowStepRun"
       SET status = $1,
           "startedAt" = CASE WHEN $1 = $2 THEN COALESCE("startedAt", NOW()) ELSE "startedAt" END,
           "updatedAt" = NOW()
       WHERE "runId" = $3 AND "nodeId" = $4`,
      [status, TestWorkflowStepStatus.Running, runId, nodeId],
    );
  }

  private async persistStep(
    runId: string,
    nodeId: string,
    data: {
      status: TestWorkflowStepStatus;
      requestJson: unknown;
      responseJson: unknown;
      assertionsJson: unknown;
      exportsJson: unknown;
      inputsJson: unknown;
      durationMs: number;
      errorCode: string | null;
      errorMessage: string | null;
    },
  ): Promise<void> {
    await this.pool.query(
      `UPDATE "TestWorkflowStepRun"
       SET status = $1, "requestJson" = $2, "responseJson" = $3,
           "assertionsJson" = $4, "exportsJson" = $5, "inputsJson" = $6,
           "startedAt" = COALESCE("startedAt", NOW()), "finishedAt" = NOW(), "durationMs" = $7,
           "errorCode" = $8, "errorMessage" = $9, "updatedAt" = NOW()
       WHERE "runId" = $10 AND "nodeId" = $11`,
      [
        data.status,
        data.requestJson !== null ? JSON.stringify(data.requestJson) : null,
        data.responseJson !== null ? JSON.stringify(data.responseJson) : null,
        data.assertionsJson !== null ? JSON.stringify(data.assertionsJson) : null,
        data.exportsJson !== null ? JSON.stringify(data.exportsJson) : null,
        data.inputsJson !== null ? JSON.stringify(data.inputsJson) : null,
        data.durationMs,
        data.errorCode,
        data.errorMessage,
        runId,
        nodeId,
      ],
    );
  }

  private async cancelRemainingSteps(
    runId: string,
    nodeOrder: string[],
    failedNodes: Set<string>,
    startingFrom: Set<string>,
  ): Promise<void> {
    const remaining = nodeOrder.filter((id) => startingFrom.has(id) || !failedNodes.has(id));
    for (const nodeId of remaining) {
      await this.markStepStatus(runId, nodeId, TestWorkflowStepStatus.Canceled);
    }
  }
}

function parseResponseBody(body: unknown): unknown {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}
