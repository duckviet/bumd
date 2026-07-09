import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { TestWorkflowRunnerService } from "./test-workflow-runner.service.js";

const REAPER_INTERVAL_MS = 60_000; // every 60 seconds

/**
 * Periodic background job that marks stale "running" workflow runs as failed.
 * Runs as a simple setInterval since the project may not have @nestjs/schedule.
 */
@Injectable()
export class TestWorkflowReaperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TestWorkflowReaperService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  public constructor(private readonly runner: TestWorkflowRunnerService) {}

  public onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.sweep();
    }, REAPER_INTERVAL_MS);
    this.logger.log("Reaper started (60s interval)");
  }

  public onModuleDestroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async sweep(): Promise<void> {
    try {
      await this.runner.reaperSweep();
    } catch (err) {
      this.logger.error(`Reaper sweep failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
