import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import { ApiTokenGuard } from "../auth/api-token.guard.js";
import { AuthenticatedApiToken } from "../auth/api-token-request.js";
import { authHttpException } from "../auth/auth-errors.js";
import { ApiTokenScope, type ApiTokenAuthContext } from "../auth/auth-types.js";
import type { SearchIndex } from "./search-types.js";
import { SEARCH_INDEX } from "./search-types.js";

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
    if (auth.organizationId !== orgSlug || !hasReadScope(auth.scopes)) {
      throw authHttpException({ code: "forbidden", message: "API token cannot read this doc", statusCode: 403 });
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

function hasReadScope(scopes: readonly ApiTokenScope[]): boolean {
  return scopes.includes(ApiTokenScope.DocsRead) || scopes.includes(ApiTokenScope.DocsDeploy);
}
