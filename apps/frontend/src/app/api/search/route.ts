import { NextResponse, type NextRequest } from "next/server";
import { searchPortalDoc } from "@/shared/api/portal-client";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const orgSlug = searchParams.get("orgSlug") ?? "";
  const docSlug = searchParams.get("docSlug") ?? "";
  const q = searchParams.get("q") ?? "";
  const branchSlug = searchParams.get("branchSlug") ?? undefined;
  const versionId = searchParams.get("versionId") ?? undefined;
  const forwarded = request.headers.get("authorization") ?? undefined;
  const apiToken = process.env["BUMD_BACKEND_API_TOKEN"] ?? tokenFromAuthorization(forwarded);
  const result = await searchPortalDoc({
    orgSlug,
    docSlug,
    q,
    ...(apiToken === undefined ? {} : { apiToken }),
    ...(branchSlug === undefined ? {} : { branchSlug }),
    ...(versionId === undefined ? {} : { versionId }),
  });
  return NextResponse.json(result);
}

function tokenFromAuthorization(authorization: string | undefined): string | undefined {
  if (authorization === undefined) {
    return undefined;
  }
  const [scheme, token, extra] = authorization.split(" ");
  if ((scheme !== "Bearer" && scheme !== "Token") || token === undefined || extra !== undefined) {
    return undefined;
  }
  return token;
}
