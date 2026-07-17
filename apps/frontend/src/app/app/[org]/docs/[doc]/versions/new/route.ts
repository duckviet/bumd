import { redirect } from "next/navigation";
import { requireDashboardManage } from "@/app/app/[org]/docs/dashboard-helpers";
import { dashboardDeploySpec } from "@/shared/api/dashboard-management-client";

type RouteContext = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
  }>;
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { org, doc: docSlug } = await context.params;
  await requireDashboardManage(org);

  const form = await request.formData();
  const file = form.get("specFile");
  const branchSlug = (form.get("branch") as string || "main").trim();

  if (!(file instanceof File) || file.size === 0 || branchSlug === "") {
    return new Response("Invalid upload files or branch", { status: 400 });
  }

  const specContent = await file.text();
  const fileBase64 = Buffer.from(specContent, "utf8").toString("base64");
  const filename = file.name || "spec.yaml";

  try {
    await dashboardDeploySpec(org, docSlug, branchSlug, {
      orgSlug: org,
      docSlug: docSlug,
      branchSlug: branchSlug,
      filename: filename,
      sourceFormat: "openapi",
      specBase64: fileBase64,
    });
  } catch {
    return new Response("Failed to deploy spec to backend", { status: 500 });
  }

  redirect(`/app/${org}/docs/${docSlug}`);
}
