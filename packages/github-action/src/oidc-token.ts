import * as core from "@actions/core";
import { HTTPError } from "ky";
import ky from "ky";
import { z } from "zod";
import type { ActionInputs } from "./action-inputs.js";

export type AuthenticatedActionInputs = ActionInputs & {
  readonly backendToken: string;
};

const oidcExchangeResponseSchema = z.object({
  token: z.string().min(1),
});

export async function resolveBackendToken(inputs: ActionInputs): Promise<AuthenticatedActionInputs> {
  if (inputs.authMode === "token") {
    if (inputs.backendToken === undefined) {
      throw new Error("backend_token is required when auth_mode is token");
    }
    return { ...inputs, backendToken: inputs.backendToken };
  }

  const oidcToken = await core.getIDToken("bumd");
  const repository = requiredEnv("GITHUB_REPOSITORY");
  const ref = requiredEnv("GITHUB_REF");
  const response = await exchangeOidcToken({
    apiUrl: inputs.apiUrl,
    oidcToken,
    organizationSlug: inputs.orgSlug,
    repository,
    ref,
  });
  core.setSecret(response.token);
  return { ...inputs, backendToken: response.token };
}

async function exchangeOidcToken(input: {
  readonly apiUrl: string;
  readonly oidcToken: string;
  readonly organizationSlug: string;
  readonly repository: string;
  readonly ref: string;
}): Promise<z.infer<typeof oidcExchangeResponseSchema>> {
  try {
    const rawResponse = await ky
      .post(oidcExchangeUrl(input.apiUrl), {
        json: {
          token: input.oidcToken,
          organizationSlug: input.organizationSlug,
          repository: input.repository,
          ref: input.ref,
        },
        timeout: 10_000,
        retry: {
          limit: 2,
          retryOnTimeout: true,
        },
      })
      .json();
    return oidcExchangeResponseSchema.parse(rawResponse);
  } catch (error) {
    if (error instanceof HTTPError) {
      throw new Error(`GitHub OIDC token exchange failed: ${await error.response.text()}`);
    }
    if (error instanceof z.ZodError) {
      throw new Error("GitHub OIDC token exchange response did not match the expected schema");
    }
    throw error;
  }
}

function oidcExchangeUrl(apiUrl: string): string {
  return new URL("/v1/auth/github/oidc-token", apiUrl).toString();
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required when auth_mode is oidc`);
  }
  return value;
}
