import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { executeTryItOut } from "../../../shared/api/portal-client";

const routeRequestSchema = z.object({
  orgSlug: z.string(),
  docSlug: z.string(),
  branchSlug: z.string(),
  versionId: z.string(),
  serverUrl: z.string(),
  method: z.string(),
  path: z.string(),
  query: z.record(z.string(), z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = routeRequestSchema.parse(await request.json());
  const result = await executeTryItOut({
    orgSlug: parsed.orgSlug,
    docSlug: parsed.docSlug,
    branchSlug: parsed.branchSlug,
    versionId: parsed.versionId,
    body: {
      serverUrl: parsed.serverUrl,
      method: parsed.method,
      path: parsed.path,
      ...(parsed.query === undefined ? {} : { query: parsed.query }),
      ...(parsed.headers === undefined ? {} : { headers: parsed.headers }),
      ...(parsed.body === undefined ? {} : { body: parsed.body }),
    },
  });
  return NextResponse.json(result);
}
