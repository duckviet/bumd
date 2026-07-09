import { BadRequestException, Body, Controller, HttpCode, Post } from "@nestjs/common";
import { z } from "zod";
import { authHttpException } from "./auth-errors.js";
import { GithubOAuthExchangeError, GithubOAuthService } from "./github-oauth.service.js";
import type { GithubOAuthExchangeInput } from "./github-oauth-types.js";

const exchangeSchema = z.object({
  githubAccessToken: z.string().min(1),
  organizationSlug: z.string().min(1),
});

@Controller("v1/auth/github/exchange")
export class GithubOAuthController {
  public constructor(private readonly service: GithubOAuthService) {}

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
      if (error instanceof GithubOAuthExchangeError) {
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

function parseExchangeInput(body: unknown): GithubOAuthExchangeInput {
  const parsed = exchangeSchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      error: {
        code: "validation_failed",
        message: "GitHub OAuth exchange request is malformed",
        details: {},
      },
    });
  }
  return parsed.data;
}
