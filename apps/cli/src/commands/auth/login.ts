import { Command, Flags } from "@oclif/core";
import { HTTPError } from "ky";
import ky from "ky";
import { z } from "zod";
import { writeAuthState } from "../../auth/auth-store.js";

const deviceCodeSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.string().url(),
  interval: z.number().int().positive().optional(),
});

const accessTokenSchema = z.discriminatedUnion("error", [
  z.object({ error: z.literal("authorization_pending"), interval: z.number().int().positive().optional() }),
  z.object({ error: z.literal("slow_down"), interval: z.number().int().positive().optional() }),
  z.object({ error: z.literal("expired_token") }),
  z.object({ error: z.literal("access_denied") }),
]);

const successfulAccessTokenSchema = z.object({
  access_token: z.string().min(1),
});

const exchangeResponseSchema = z.object({
  token: z.string().min(1),
  tokenPrefix: z.string().min(1),
});

export default class AuthLogin extends Command {
  public static readonly description = "Log in to Bumd with GitHub device authentication";

  public static readonly flags = {
    "api-url": Flags.string({ default: "http://localhost:3001", description: "Bumd API URL" }),
    org: Flags.string({ required: true, description: "Bumd organization slug" }),
    "client-id": Flags.string({ description: "GitHub OAuth app client ID" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AuthLogin);
    const clientId = flags["client-id"] ?? process.env["GITHUB_OAUTH_CLIENT_ID"];
    if (clientId === undefined || clientId.trim() === "") {
      this.error("GITHUB_OAUTH_CLIENT_ID or --client-id is required for GitHub login", { exit: 1 });
    }
    const device = await requestDeviceCode(clientId);
    this.log(`Open ${device.verification_uri} and enter code ${device.user_code}`);
    const githubAccessToken = await pollForGithubAccessToken({
      clientId,
      deviceCode: device.device_code,
      intervalSeconds: device.interval ?? 5,
    });
    const exchanged = await exchangeForBumdToken({
      apiUrl: flags["api-url"],
      githubAccessToken,
      organizationSlug: flags.org,
    });
    await writeAuthState({
      apiUrl: flags["api-url"],
      organizationSlug: flags.org,
      token: exchanged.token,
      tokenPrefix: exchanged.tokenPrefix,
    });
    this.log(`Logged in to ${flags["api-url"]} as ${flags.org}`);
  }
}

async function requestDeviceCode(clientId: string): Promise<z.infer<typeof deviceCodeSchema>> {
  const raw = await ky
    .post(endpoint("GITHUB_DEVICE_CODE_URL", "https://github.com/login/device/code"), {
      body: new URLSearchParams({
        client_id: clientId,
        scope: "read:user user:email",
      }),
      headers: { Accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      timeout: 10_000,
    })
    .json();
  return deviceCodeSchema.parse(raw);
}

async function pollForGithubAccessToken(input: {
  readonly clientId: string;
  readonly deviceCode: string;
  readonly intervalSeconds: number;
}): Promise<string> {
  let intervalSeconds = input.intervalSeconds;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await sleep(intervalSeconds * 1000);
    const raw: unknown = await ky
      .post(endpoint("GITHUB_ACCESS_TOKEN_URL", "https://github.com/login/oauth/access_token"), {
        body: new URLSearchParams({
          client_id: input.clientId,
          device_code: input.deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
        headers: { Accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
        timeout: 10_000,
      })
      .json();
    const success = successfulAccessTokenSchema.safeParse(raw);
    if (success.success) {
      return success.data.access_token;
    }
    const pending = accessTokenSchema.safeParse(raw);
    if (!pending.success || pending.data.error === "expired_token" || pending.data.error === "access_denied") {
      throw new Error("GitHub device authorization failed");
    }
    if (pending.data.error === "slow_down") {
      intervalSeconds += 5;
    } else if (pending.data.interval !== undefined) {
      intervalSeconds = pending.data.interval;
    }
  }
  throw new Error("GitHub device authorization timed out");
}

async function exchangeForBumdToken(input: {
  readonly apiUrl: string;
  readonly githubAccessToken: string;
  readonly organizationSlug: string;
}): Promise<z.infer<typeof exchangeResponseSchema>> {
  try {
    const raw = await ky
      .post(new URL("/v1/auth/github/exchange", input.apiUrl), {
        json: {
          githubAccessToken: input.githubAccessToken,
          organizationSlug: input.organizationSlug,
        },
        timeout: 10_000,
      })
      .json();
    return exchangeResponseSchema.parse(raw);
  } catch (error) {
    if (error instanceof HTTPError) {
      throw new Error(`Bumd GitHub exchange failed: ${await error.response.text()}`);
    }
    throw error;
  }
}

function endpoint(envName: string, fallback: string): string {
  return process.env[envName] ?? fallback;
}

function sleep(milliseconds: number): Promise<void> {
  if (process.env["BUMD_AUTH_POLL_SKIP_SLEEP"] === "true") {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
