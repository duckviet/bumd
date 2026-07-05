import { Controller, Get, Inject, Param, Query, Req, HttpException } from "@nestjs/common";
import type { SearchIndex } from "./search-types.js";
import { SEARCH_INDEX } from "./search-types.js";
import { API_TOKEN_STORE, type ApiTokenStore } from "../auth/auth-ports.js";
import { ApiTokenCrypto } from "../auth/api-token-crypto.js";
import { requestId } from "../versions/deploy-errors.js";
import { Pool } from "pg";

function extractToken(authorization: string | undefined): string | null {
  const [scheme, token, extra] = authorization?.split(" ") ?? [];
  if (scheme !== "Bearer" && scheme !== "Token") {
    return null;
  }
  if (token === undefined || token.trim() === "" || extra !== undefined) {
    return null;
  }
  return token;
}

function isExpired(expiresAt: string | null): boolean {
  return expiresAt !== null && Date.parse(expiresAt) <= Date.now();
}

@Controller("v1/orgs/:orgSlug/docs/:docSlug/search")
export class SearchController {
  private pool: Pool | null = null;

  public constructor(
    @Inject(SEARCH_INDEX) private readonly searchIndex: SearchIndex,
    @Inject(API_TOKEN_STORE) private readonly tokenStore: ApiTokenStore,
    private readonly crypto: ApiTokenCrypto,
  ) {}

  private database(): Pool {
    if (this.pool === null) {
      const databaseUrl = process.env["DATABASE_URL"] ?? "postgresql://bumd:bumd@localhost:5436/bumd";
      this.pool = new Pool({ connectionString: databaseUrl });
    }
    return this.pool;
  }

  @Get()
  public async search(
    @Param("orgSlug") orgSlug: string,
    @Param("docSlug") docSlug: string,
    @Query("q") q: string | undefined,
    @Query("branchSlug") branchSlug: string | undefined,
    @Query("versionId") versionId: string | undefined,
    @Req() request: any,
  ): Promise<unknown> {
    const authHeader = request.headers.authorization;
    let isAuthorized = false;
    let tokenValid = false;
    let tokenOrg: string | null = null;

    if (authHeader) {
      try {
        const plaintext = extractToken(authHeader);
        if (plaintext !== null) {
          const prefix = this.crypto.prefix(plaintext);
          const record = await this.tokenStore.findTokenByPrefix(prefix);
          if (record !== null && record.revokedAt === null && !isExpired(record.expiresAt)) {
            const verified = await this.crypto.verify(record.tokenHash, plaintext);
            if (verified) {
              tokenValid = true;
              tokenOrg = record.organizationId;
              if (tokenOrg === orgSlug) {
                isAuthorized = true;
              }
            }
          }
        }
      } catch (error) {
        // Fallback
      }
    }

    if (!isAuthorized) {
      if (tokenValid && tokenOrg !== orgSlug) {
        throw new HttpException(
          {
            error: {
              code: "forbidden",
              message: "API token cannot access this organization",
              requestId: requestId(),
              details: {},
            },
          },
          403,
        );
      }

      if (process.env["DEPLOY_STORE"] === "memory") {
        throw new HttpException(
          {
            error: {
              code: "unauthorized",
              message: "Missing or invalid API token",
              requestId: requestId(),
              details: {},
            },
          },
          401,
        );
      }

      // Query database for doc visibility
      const docResult = await this.database().query<{ visibility: string }>(
        `
          SELECT d.visibility
          FROM "Doc" d
          INNER JOIN "Organization" o ON o.id = d."organizationId"
          WHERE o.slug = $1 AND d.slug = $2
          LIMIT 1
        `,
        [orgSlug, docSlug],
      );
      const doc = docResult.rows[0];
      if (doc === undefined) {
        throw new HttpException(
          {
            error: {
              code: "doc_not_found",
              message: "Doc not found",
              requestId: requestId(),
              details: {},
            },
          },
          404,
        );
      }

      if (doc.visibility !== "public") {
        throw new HttpException(
          {
            error: {
              code: "unauthorized",
              message: "Missing or invalid API token",
              requestId: requestId(),
              details: {},
            },
          },
          401,
        );
      }
    }

    return this.searchIndex.search({
      organizationId: orgSlug,
      docId: docSlug,
      query: q ?? "",
      ...(branchSlug === undefined ? {} : { branchId: branchSlug }),
      ...(versionId === undefined ? {} : { versionId }),
    });
  }
}
