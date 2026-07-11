import { redirect } from "next/navigation";
import { requireDashboardManage } from "@/app/app/[org]/docs/dashboard-helpers";
import { backendBaseUrl } from "@/shared/config/env";

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

  const adminToken = process.env["BUMD_ADMIN_SESSION_TOKEN"];
  if (!adminToken || adminToken.trim() === "") {
    if (process.env["NODE_ENV"] === "production") {
      return new Response("BUMD_ADMIN_SESSION_TOKEN environment variable is not configured", { status: 500 });
    }
  }
  const finalAdminToken = adminToken || "test_admin_session_not_secret";

  const tokenRes = await fetch(`${backendBaseUrl()}/v1/orgs/${org}/api-tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${finalAdminToken}`,
    },
    body: JSON.stringify({
      name: `web-upload-${Date.now()}`,
      role: "member",
      scopes: ["docs:deploy"],
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    return new Response(`Failed to authenticate with backend: ${errText}`, { status: 500 });
  }

  const tokenData = await tokenRes.json();
  const apiToken = tokenData.token;

  const deployRes = await fetch(`${backendBaseUrl()}/v1/orgs/${org}/docs/${docSlug}/branches/${branchSlug}/deploys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      orgSlug: org,
      docSlug: docSlug,
      branchSlug: branchSlug,
      filename: filename,
      sourceFormat: "openapi",
      specBase64: fileBase64,
    }),
  });

  if (!deployRes.ok) {
    const errText = await deployRes.text();
    return new Response(`Failed to deploy spec to backend: ${errText}`, { status: 500 });
  }

  redirect(`/app/${org}/docs/${docSlug}`);
}
