import { BadRequestException, Body, Controller, HttpCode, Post } from "@nestjs/common";
import { z, ZodError } from "zod";
import { authHttpException } from "./auth-errors.js";
import { GithubOidcExchangeError, GithubOidcTokenService } from "./github-oidc-token.service.js";
import type { GithubOidcExchangeInput } from "./github-oidc-types.js";

const exchangeSchema = z.object({
  token: z.string().min(1),
  organizationSlug: z.string().regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/u),
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
  ref: z.string().min(1).optional(),
});

@Controller("v1/auth/github/oidc-token")
export class GithubOidcTokenController {
  public constructor(private readonly service: GithubOidcTokenService) {}

  @Post()
  @HttpCode(201)
  public async create(@Body() body: unknown): Promise<unknown> {
    const input = parseExchangeInput(body);
    try {
      const issued = await this.service.exchange(input);
      return {
        id: issued.id,
        token: issued.token,
        tokenPrefix: issued.tokenPrefix,
        name: issued.name,
        scopes: issued.scopes,
      };
    } catch (error) {
      if (error instanceof GithubOidcExchangeError) {
        throw authHttpException({
          code: error.code,
          message: error.message,
          statusCode: error.code === "unauthorized" ? 401 : 403,
        });
      }
      throw error;
    }
  }
}

function parseExchangeInput(input: unknown): GithubOidcExchangeInput {
  try {
    const parsed = exchangeSchema.parse(input);
    if (parsed.ref === undefined) {
      return {
        token: parsed.token,
        organizationSlug: parsed.organizationSlug,
        repository: parsed.repository,
      };
    }
    return {
      token: parsed.token,
      organizationSlug: parsed.organizationSlug,
      repository: parsed.repository,
      ref: parsed.ref,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      throw new BadRequestException({
        error: {
          code: "bad_request",
          message: "GitHub OIDC exchange request is malformed",
          details: {},
        },
      });
    }
    throw error;
  }
}
