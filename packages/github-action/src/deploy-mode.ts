import { readFile } from "node:fs/promises";
import { buildDeployRequest, inferSourceFormat, postDeploy } from "@bumd/cli/deploy";
import * as core from "@actions/core";
import type { AuthenticatedActionInputs } from "./oidc-token.js";

export async function runDeployMode(inputs: AuthenticatedActionInputs): Promise<void> {
  const specBytes = await readFile(inputs.filePath);
  const request = buildDeployRequest({
    orgSlug: inputs.orgSlug,
    docSlug: inputs.docSlug,
    branchSlug: inputs.branchSlug,
    filePath: inputs.filePath,
    sourceFormat: inferSourceFormat(inputs.filePath, inputs.sourceFormat),
    specBytes,
  });
  const result = await postDeploy({
    apiUrl: inputs.apiUrl,
    orgSlug: inputs.orgSlug,
    docSlug: inputs.docSlug,
    branchSlug: inputs.branchSlug,
    token: inputs.backendToken,
    body: request.body,
    localSha256: request.localSha256,
  });

  core.setOutput("version_id", result.version.id);
  core.setOutput("skipped", String(result.skipped));
  core.setOutput("local_sha256", result.localSha256);
  core.setOutput("public_url", versionUrl(inputs, result.version.id));
  if (result.job !== undefined) {
    core.setOutput("job_id", result.job.id);
  }
  core.info(result.skipped ? `Skipped unchanged version ${result.version.id}` : `Queued version ${result.version.id}`);
}

function versionUrl(inputs: AuthenticatedActionInputs, versionId: string): string {
  const path = `/v1/orgs/${encodeURIComponent(inputs.orgSlug)}/docs/${encodeURIComponent(inputs.docSlug)}/branches/${encodeURIComponent(inputs.branchSlug)}/versions/${encodeURIComponent(versionId)}`;
  return new URL(path, inputs.apiUrl).toString();
}
