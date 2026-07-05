import { Command, Flags } from "@oclif/core";
import { readAuthState } from "../auth/auth-store.js";
import { CatalogClientError, fetchVersions } from "../deploy/catalog-client.js";
import { ProjectConfigError, resolveCliContext } from "../config/project-config.js";

export default class Versions extends Command {
  public static override description = "List versions for a doc branch";

  public static override flags = {
    "api-url": Flags.string({ description: "Base API URL" }),
    org: Flags.string({ description: "Organization slug" }),
    doc: Flags.string({ description: "Documentation slug" }),
    branch: Flags.string({ description: "Branch slug" }),
    json: Flags.boolean({ default: false, description: "Print JSON output" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Versions);
    const storedAuth = await readAuthState();
    const token = process.env["BUMD_API_TOKEN"] ?? storedAuth?.token;

    if (token === undefined) {
      this.error("Missing API token. Run `bumd auth login` or set BUMD_API_TOKEN.", { exit: 1 });
    }

    try {
      const context = await resolveCliContext({
        apiUrl: flags["api-url"],
        org: flags.org,
        doc: flags.doc,
        branch: flags.branch,
      });
      const versions = await fetchVersions({
        apiUrl: context.apiUrl,
        orgSlug: context.org,
        docSlug: context.doc,
        branchSlug: context.branch,
        token,
      });

      if (flags.json) {
        this.log(JSON.stringify({ versions }, null, 2));
        return;
      }

      for (const version of versions) {
        this.log(`${version.id} ${version.status} ${version.sha256}`);
      }
    } catch (error) {
      if (error instanceof CatalogClientError) {
        this.error(error.message, { exit: 1 });
      }

      if (error instanceof ProjectConfigError) {
        this.error(error.message, { exit: 1 });
      }

      throw error;
    }
  }
}
