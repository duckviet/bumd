import { readFile } from "node:fs/promises";
import { Command, Flags } from "@oclif/core";
import { DeployClientError, postDeploy } from "../deploy/deploy-client.js";
import { buildDeployRequest, inferSourceFormat } from "../deploy/deploy-request.js";
import { readAuthState } from "../auth/auth-store.js";

export default class Deploy extends Command {
  public static override description = "Deploy an OpenAPI or AsyncAPI spec";

  public static override flags = {
    "api-url": Flags.string({ required: true, description: "Base API URL" }),
    org: Flags.string({ required: true, description: "Organization slug" }),
    doc: Flags.string({ required: true, description: "Documentation slug" }),
    branch: Flags.string({ required: true, description: "Branch slug" }),
    file: Flags.string({ required: true, description: "Path to the spec file" }),
    "source-format": Flags.string({ options: ["openapi", "asyncapi"], description: "Spec source format" }),
    json: Flags.boolean({ description: "Print structured JSON output" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Deploy);
    const storedAuth = await readAuthState();
    const token = process.env["BUMD_API_TOKEN"] ?? storedAuth?.token;
    if (token === undefined || token.trim() === "") {
      this.error("BUMD_API_TOKEN or `bumd auth login` is required for deploy authentication", { exit: 1 });
    }

    try {
      const specBytes = await readFile(flags.file);
      const request = buildDeployRequest({
        orgSlug: flags.org,
        docSlug: flags.doc,
        branchSlug: flags.branch,
        filePath: flags.file,
        sourceFormat: inferSourceFormat(flags.file, flags["source-format"]),
        specBytes,
      });
      const result = await postDeploy({
        apiUrl: flags["api-url"],
        orgSlug: flags.org,
        docSlug: flags.doc,
        branchSlug: flags.branch,
        token,
        body: request.body,
        localSha256: request.localSha256,
      });

      if (flags.json) {
        this.log(JSON.stringify(result));
        return;
      }

      this.log(result.skipped ? `Skipped unchanged version ${result.version.id}` : `Queued version ${result.version.id}`);
      this.log(`Local SHA-256: ${result.localSha256}`);
    } catch (error) {
      if (error instanceof DeployClientError) {
        this.error(error.message, { exit: 1 });
      }
      throw error;
    }
  }
}
