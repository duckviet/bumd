import { Body, Controller, HttpCode, Inject, Param, Post, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { z, ZodError } from "zod";
import { adminSessionCanIssueForOrg, AdminSessionGuard } from "./admin-session.guard.js";
import { API_TOKEN_STORE, type ApiTokenStore } from "./auth-ports.js";
import { ApiTokenRole, ApiTokenScope, type ApiTokenScope as ApiTokenScopeType } from "./auth-types.js";
import { authHttpException } from "./auth-errors.js";

const createTokenSchema = z.object({
  name: z.string().min(1),
  role: z.union([
    z.literal(ApiTokenRole.Owner),
    z.literal(ApiTokenRole.Admin),
    z.literal(ApiTokenRole.Member),
    z.literal(ApiTokenRole.Guest),
  ]),
  scopes: z.array(z.union([z.literal(ApiTokenScope.DocsDeploy), z.literal(ApiTokenScope.DocsRead)])).min(1),
  expiresAt: z.string().datetime().optional(),
});

@Controller("v1/orgs/:orgSlug/api-tokens")
@UseGuards(AdminSessionGuard)
export class ApiTokensController {
  public constructor(@Inject(API_TOKEN_STORE) private readonly store: ApiTokenStore) {}

  @Post()
  @HttpCode(201)
  public async create(
    @Param("orgSlug") orgSlug: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: FastifyReply,
  ): Promise<unknown> {
    void response;
    const parsed = parseCreateToken(body);
    if (!adminSessionCanIssueForOrg(orgSlug)) {
      throw authHttpException({ code: "forbidden", message: "Session cannot manage this organization", statusCode: 403 });
    }
    const createInput = parsed.expiresAt === undefined ? {
      organizationId: orgSlug,
      name: parsed.name,
      role: parsed.role,
      scopes: parsed.scopes,
    } : {
      organizationId: orgSlug,
      name: parsed.name,
      role: parsed.role,
      scopes: parsed.scopes,
      expiresAt: parsed.expiresAt,
    };
    const issued = await this.store.createApiToken(createInput);
    return {
      id: issued.id,
      token: issued.token,
      tokenPrefix: issued.tokenPrefix,
      name: issued.name,
      scopes: issued.scopes,
    };
  }
}

function parseCreateToken(input: unknown): {
  readonly name: string;
  readonly role: ApiTokenRole;
  readonly scopes: readonly ApiTokenScopeType[];
  readonly expiresAt?: string;
} {
  try {
    const parsed = createTokenSchema.parse(input);
    if (parsed.expiresAt === undefined) {
      return {
        name: parsed.name,
        role: parsed.role,
        scopes: parsed.scopes,
      };
    }
    return {
      name: parsed.name,
      role: parsed.role,
      scopes: parsed.scopes,
      expiresAt: parsed.expiresAt,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      throw authHttpException({ code: "forbidden", message: "Token request is malformed", statusCode: 403 });
    }
    throw error;
  }
}
