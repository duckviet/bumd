import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  HttpException,
  HttpCode,
  Inject,
} from "@nestjs/common";
import { GithubService } from "./github.service.js";
import { GithubWorker } from "./github-worker.js";
import type { GithubJobData, PushWebhookPayload, PullRequestWebhookPayload } from "./github-types.js";
import type { CreateMappingInput, LinkRepositoryInput } from "./github-types.js";
import { GITHUB_QUEUE, type GithubQueue } from "./github-queue.js";
import { requestId } from "../versions/deploy-errors.js";

function notFound(message: string): HttpException {
  return new HttpException(
    { error: { code: "not_found", message, requestId: requestId(), details: {} } },
    404,
  );
}

function forbidden(message: string): HttpException {
  return new HttpException(
    { error: { code: "forbidden", message, requestId: requestId(), details: {} } },
    403,
  );
}

// ---------------------------------------------------------------------------
// Installations
// ---------------------------------------------------------------------------

@Controller("v1/orgs/:orgSlug/github/installations")
export class GithubInstallationsController {
  public constructor(private readonly githubService: GithubService) {}

  @Get()
  public async list(@Param("orgSlug") orgSlug: string): Promise<unknown> {
    const records = await this.githubService.listInstallations(orgSlug);
    return { installations: records };
  }
}

// ---------------------------------------------------------------------------
// Repositories
// ---------------------------------------------------------------------------

@Controller("v1/orgs/:orgSlug/github/repositories")
export class GithubRepositoriesController {
  public constructor(private readonly githubService: GithubService) {}

  @Get()
  public async list(@Param("orgSlug") orgSlug: string): Promise<unknown> {
    const records = await this.githubService.listRepositories(orgSlug);
    return { repositories: records };
  }

  @Post()
  @HttpCode(201)
  public async link(@Param("orgSlug") orgSlug: string, @Body() body: unknown): Promise<unknown> {
    const input = parseBody<LinkRepositoryInput>(body, ["githubInstallationId", "githubRepoId", "fullName"]);
    const record = await this.githubService.linkRepository(orgSlug, input);
    return { repository: record };
  }

  @Delete(":repoId")
  @HttpCode(204)
  public async unlink(@Param("orgSlug") orgSlug: string, @Param("repoId") repoId: string): Promise<void> {
    await this.githubService.unlinkRepository(orgSlug, repoId);
  }
}

// ---------------------------------------------------------------------------
// Branch mappings
// ---------------------------------------------------------------------------

@Controller("v1/orgs/:orgSlug/github/repositories/:githubRepoId/mappings")
export class GithubMappingsController {
  public constructor(private readonly githubService: GithubService) {}

  @Get()
  public async list(
    @Param("orgSlug") orgSlug: string,
    @Param("githubRepoId") githubRepoId: string,
  ): Promise<unknown> {
    const records = await this.githubService.listMappings(orgSlug, githubRepoId);
    return { mappings: records };
  }

  @Post()
  @HttpCode(201)
  public async create(
    @Param("orgSlug") orgSlug: string,
    @Param("githubRepoId") githubRepoId: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const input = parseBody<CreateMappingInput>(body, ["branchName", "specPath", "docId"]);
    const record = await this.githubService.createMapping(orgSlug, githubRepoId, input);
    return { mapping: record };
  }

  @Delete(":mappingId")
  @HttpCode(204)
  public async delete(
    @Param("orgSlug") orgSlug: string,
    @Param("mappingId") mappingId: string,
  ): Promise<void> {
    await this.githubService.deleteMapping(orgSlug, mappingId);
  }
}

// ---------------------------------------------------------------------------
// Public GitHub webhook receiver
// ---------------------------------------------------------------------------

type RawBodyRequest = {
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
};

@Controller("v1/github/webhooks")
export class GithubWebhookController {
  public constructor(
    private readonly githubService: GithubService,
    @Inject(GITHUB_QUEUE) private readonly queue: GithubQueue,
  ) {}

  @Post()
  @HttpCode(200)
  public async receive(@Req() req: RawBodyRequest): Promise<{ ok: boolean }> {
    const rawBody: Buffer = req.rawBody ?? Buffer.alloc(0);
    const signature = req.headers["x-hub-signature-256"];
    const event = req.headers["x-github-event"];

    if (typeof signature !== "string" || !this.githubService.verifyWebhookSignature(rawBody, signature)) {
      throw new HttpException(
        { error: { code: "unauthorized", message: "Invalid webhook signature", requestId: requestId(), details: {} } },
        401,
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8")) as unknown;
    } catch {
      throw new HttpException(
        { error: { code: "bad_request", message: "Malformed webhook body", requestId: requestId(), details: {} } },
        400,
      );
    }

    if (event === "push") {
      const pushPayload = payload as PushWebhookPayload;
      const jobData: GithubJobData = { type: "push", payload: pushPayload };
      await this.queue.enqueue(jobData);
    } else if (event === "pull_request") {
      const prPayload = payload as PullRequestWebhookPayload;
      const actionField = (prPayload as Record<string, unknown>)["action"];
      if (actionField === "opened" || actionField === "synchronize" || actionField === "reopened") {
        const jobData: GithubJobData = { type: "pull_request", payload: prPayload };
        await this.queue.enqueue(jobData);
      }
    } else if (event === "installation") {
      await this.handleInstallationEvent(payload);
    }

    return { ok: true };
  }

  private async handleInstallationEvent(payload: unknown): Promise<void> {
    const p = payload as Record<string, unknown>;
    const action = p["action"];
    if (action !== "created" && action !== "deleted") {
      return;
    }

    const installation = p["installation"] as Record<string, unknown> | undefined;
    if (installation === undefined) {
      return;
    }

    const installationId = String(installation["id"]);
    const account = installation["account"] as Record<string, unknown> | undefined;
    const accountName = typeof account?.["login"] === "string" ? account["login"] : "unknown";

    // Find the organizations linked to this installation
    // For now, emit a log — in production this would update the GithubInstallation table
    if (action === "deleted") {
      console.info(`[GithubWebhookController] Installation ${installationId} removed for account ${accountName}`);
    } else {
      console.info(`[GithubWebhookController] Installation ${installationId} created for account ${accountName}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseBody<T>(body: unknown, fields: readonly string[]): T {
  if (body === null || typeof body !== "object") {
    throw new HttpException(
      { error: { code: "bad_request", message: "Request body must be a JSON object", requestId: requestId(), details: {} } },
      400,
    );
  }

  const record = body as Record<string, unknown>;
  for (const field of fields) {
    if (record[field] === undefined || record[field] === null) {
      throw new HttpException(
        {
          error: {
            code: "bad_request",
            message: `Missing required field: ${field}`,
            requestId: requestId(),
            details: {},
          },
        },
        400,
      );
    }
  }

  return body as T;
}
