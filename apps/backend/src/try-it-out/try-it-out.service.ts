import { Inject, Injectable } from "@nestjs/common";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { DEPLOY_STORE, type DeployStore } from "../versions/deploy-ports.js";
import { TRY_IT_OUT_HTTP_CLIENT, type TryItOutHttpClient, type TryItOutResponse } from "./try-it-out-types.js";
import { TryItOutError } from "./try-it-out-errors.js";

const TryItOutRequestSchema = z.object({
  serverUrl: z.string().url(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
  path: z.string().startsWith("/"),
  query: z.record(z.string(), z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
});

const DefaultTimeoutMs = 5_000;
const InternalHostnames = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);
const InternalIpv4Ranges = [
  /^10\./u,
  /^127\./u,
  /^169\.254\./u,
  /^172\.(1[6-9]|2\d|3[0-1])\./u,
  /^192\.168\./u,
] as const;
const BlockedRequestHeaders = new Set(["host", "connection", "content-length", "cookie", "set-cookie", "transfer-encoding"]);

@Injectable()
export class TryItOutService {
  public constructor(
    @Inject(DEPLOY_STORE) private readonly store: DeployStore,
    @Inject(TRY_IT_OUT_HTTP_CLIENT) private readonly httpClient: TryItOutHttpClient,
  ) {}

  public async execute(input: {
    readonly orgSlug: string;
    readonly docSlug: string;
    readonly branchSlug: string;
    readonly versionId: string;
    readonly body: unknown;
  }): Promise<TryItOutResponse> {
    const request = parseRequest(input.body);
    const version = await this.store.getVersion(input.versionId);
    if (version.organizationId !== input.orgSlug || version.docId !== input.docSlug || version.branchId !== input.branchSlug) {
      throw new TryItOutError("try_it_out_version_not_found", "Version is not available for this doc.", 404);
    }

    const rawSpec = await this.store.getRawSpec(version.id);
    const target = buildTargetUrl(request.serverUrl, request.path, request.query);
    assertAllowedTarget(target, declaredServerOrigins(parseSpec(rawSpec)), allowedHostsFromEnv());
    const outboundBody = requestBody(request.body);
    return this.httpClient.send({
      url: target,
      method: request.method,
      headers: sanitizeHeaders(request.headers ?? {}, request.body),
      timeoutMs: DefaultTimeoutMs,
      ...(outboundBody === undefined ? {} : { body: outboundBody }),
    });
  }
}

function parseRequest(body: unknown): z.infer<typeof TryItOutRequestSchema> {
  const result = TryItOutRequestSchema.safeParse(body);
  if (!result.success) {
    throw new TryItOutError("invalid_try_it_out_request", "Try it out request is invalid.", 400);
  }
  return result.data;
}

function buildTargetUrl(serverUrl: string, path: string, query: Record<string, string> | undefined): URL {
  const base = new URL(serverUrl);
  const target = new URL(path, `${base.origin}${base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`}`);
  for (const [name, value] of Object.entries(query ?? {})) {
    target.searchParams.set(name, value);
  }
  return target;
}

function assertAllowedTarget(target: URL, declaredOrigins: ReadonlySet<string>, allowedHosts: ReadonlySet<string>): void {
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new TryItOutError("try_it_out_target_forbidden", "Target protocol is not allowed.", 403);
  }
  if (!declaredOrigins.has(target.origin)) {
    throw new TryItOutError("try_it_out_target_forbidden", "Target server is not declared by this spec.", 403);
  }
  if (isInternalHostname(target.hostname) && !allowedHosts.has(target.hostname)) {
    throw new TryItOutError("try_it_out_target_forbidden", "Target host is not allowed.", 403);
  }
}

function declaredServerOrigins(spec: unknown): ReadonlySet<string> {
  if (!isRecord(spec) || !Array.isArray(spec["servers"])) {
    return new Set();
  }
  return new Set(
    spec["servers"].flatMap((server) => {
      if (!isRecord(server) || typeof server["url"] !== "string") {
        return [];
      }
      try {
        return [new URL(server["url"]).origin];
      } catch (error) {
        if (error instanceof TypeError) {
          return [];
        }
        throw error;
      }
    }),
  );
}

function allowedHostsFromEnv(): ReadonlySet<string> {
  return new Set((process.env["BUMD_TRY_PROXY_ALLOWED_HOSTS"] ?? "").split(",").map((host) => host.trim()).filter(Boolean));
}

function isInternalHostname(hostname: string): boolean {
  const normalized = hostname.toLocaleLowerCase();
  return InternalHostnames.has(normalized) || normalized === "::1" || InternalIpv4Ranges.some((range) => range.test(normalized));
}

function sanitizeHeaders(headers: Readonly<Record<string, string>>, body: unknown): Readonly<Record<string, string>> {
  const entries = Object.entries(headers).filter(([name]) => !BlockedRequestHeaders.has(name.toLocaleLowerCase()));
  if (body !== undefined && !entries.some(([name]) => name.toLocaleLowerCase() === "content-type")) {
    entries.push(["content-type", "application/json"]);
  }
  return Object.fromEntries(entries);
}

function requestBody(body: unknown): string | undefined {
  if (body === undefined) {
    return undefined;
  }
  return typeof body === "string" ? body : JSON.stringify(body);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSpec(rawSpec: string): unknown {
  try {
    const parsed: unknown = JSON.parse(rawSpec);
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return parseYaml(rawSpec);
    }
    throw error;
  }
}
