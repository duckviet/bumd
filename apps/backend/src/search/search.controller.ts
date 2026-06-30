import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import type { SearchIndex } from "./search-types.js";
import { SEARCH_INDEX } from "./search-types.js";

@Controller("v1/orgs/:orgSlug/docs/:docSlug/search")
export class SearchController {
  public constructor(@Inject(SEARCH_INDEX) private readonly searchIndex: SearchIndex) {}

  @Get()
  public async search(
    @Param("orgSlug") orgSlug: string,
    @Param("docSlug") docSlug: string,
    @Query("q") q: string | undefined,
    @Query("branchSlug") branchSlug: string | undefined,
    @Query("versionId") versionId: string | undefined,
  ): Promise<unknown> {
    return this.searchIndex.search({
      organizationId: orgSlug,
      docId: docSlug,
      query: q ?? "",
      ...(branchSlug === undefined ? {} : { branchId: branchSlug }),
      ...(versionId === undefined ? {} : { versionId }),
    });
  }
}
