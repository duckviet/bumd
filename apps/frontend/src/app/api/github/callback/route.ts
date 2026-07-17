import { redirect } from "next/navigation";
import { getInstallationDetails } from "@/shared/github-app";
import { githubUpsertInstallation } from "@/shared/api/dashboard-github-client";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const installationId = url.searchParams.get("installation_id");
  const state = url.searchParams.get("state");

  if (!installationId || !state) {
    return new Response("Missing installation_id or state", { status: 400 });
  }

  const [orgSlug, docSlug] = state.split("--");
  if (!orgSlug || !docSlug) {
    return new Response("Invalid state parameter", { status: 400 });
  }

  const appId = process.env["GITHUB_APP_ID"];
  const privateKey = process.env["GITHUB_APP_PRIVATE_KEY"];

  if (!appId || !privateKey) {
    return new Response("GitHub App is not configured on this server (missing GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY)", { status: 500 });
  }

  try {
    const { accountName } = await getInstallationDetails(appId, privateKey, installationId);

    await githubUpsertInstallation(orgSlug, installationId, accountName);
  } catch (error) {
    console.error("GitHub App callback failed");
    return new Response(error instanceof Error ? "Failed to complete GitHub App installation" : "GitHub App installation failed", { status: 500 });
  }

  redirect(`/app/${orgSlug}/docs/${docSlug}/settings`);
}
