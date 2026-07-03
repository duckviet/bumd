import { Controller, Get, Inject, Param, Query, UseGuards, HttpException } from "@nestjs/common";
import type { SearchIndex } from "./search-types.js";
import { SEARCH_INDEX } from "./search-types.js";
import { ApiTokenGuard } from "../auth/api-token.guard.js";
import { AuthenticatedApiToken } from "../auth/api-token-request.js";
import type { ApiTokenAuthContext } from "../auth/auth-types.js";
import { requestId } from "../versions/deploy-errors.js";

@Controller("v1/orgs/:orgSlug/docs/:docSlug/search")
@UseGuards(ApiTokenGuard)
export class SearchController {
  public constructor(@Inject(SEARCH_INDEX) private readonly searchIndex: SearchIndex) {}

  @Get()
  public async search(
    @Param("orgSlug") orgSlug: string,
    @Param("docSlug") docSlug: string,
    @Query("q") q: string | undefined,
    @Query("branchSlug") branchSlug: string | undefined,
    @Query("versionId") versionId: string | undefined,
    @AuthenticatedApiToken() auth: ApiTokenAuthContext,
  ): Promise<unknown> {
    if (auth.organizationId !== orgSlug) {
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

    return this.searchIndex.search({
      organizationId: orgSlug,
      docId: docSlug,
      query: q ?? "",
      ...(branchSlug === undefined ? {} : { branchId: branchSlug }),
      ...(versionId === undefined ? {} : { versionId }),
    });
  }
}
