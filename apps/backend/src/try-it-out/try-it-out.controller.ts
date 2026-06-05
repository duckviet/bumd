import { Body, Controller, HttpCode, HttpException, Param, Post } from "@nestjs/common";
import { TryItOutError } from "./try-it-out-errors.js";
import { TryItOutService } from "./try-it-out.service.js";

@Controller("v1/orgs/:orgSlug/docs/:docSlug/branches/:branchSlug/versions/:versionId/try-it-out")
export class TryItOutController {
  public constructor(private readonly service: TryItOutService) {}

  @Post()
  @HttpCode(200)
  public async execute(
    @Param("orgSlug") orgSlug: string,
    @Param("docSlug") docSlug: string,
    @Param("branchSlug") branchSlug: string,
    @Param("versionId") versionId: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    try {
      return await this.service.execute({ orgSlug, docSlug, branchSlug, versionId, body });
    } catch (error) {
      if (error instanceof TryItOutError) {
        throw new HttpException(
          {
            error: {
              code: error.code,
              message: error.message,
              requestId: `req_${Date.now()}`,
              details: {},
            },
          },
          error.statusCode,
        );
      }
      throw error;
    }
  }
}
