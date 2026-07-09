import { Command, Flags } from "@oclif/core";
import { readAuthState } from "../auth/auth-store.js";
import { CatalogClientError, fetchVersionDiff } from "../deploy/catalog-client.js";
import { ProjectConfigError, resolveCliContext } from "../config/project-config.js";

export default class Diff extends Command {
  public static override description = "Show the stored diff for a deployed version";

  public static override flags = {
    "api-url": Flags.string({ description: "Base API URL" }),
    org: Flags.string({ description: "Organization slug" }),
    doc: Flags.string({ description: "Documentation slug" }),
    branch: Flags.string({ description: "Branch slug" }),
    version: Flags.string({ required: true, description: "Version ID" }),
    "fail-on-breaking": Flags.boolean({ default: false, description: "Exit with code 2 when breaking changes are present" }),
    json: Flags.boolean({ default: false, description: "Print JSON output" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Diff);
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
      const diff = await fetchVersionDiff({
        apiUrl: context.apiUrl,
        orgSlug: context.org,
        docSlug: context.doc,
        branchSlug: context.branch,
        versionId: flags.version,
        token,
      });

      if (flags.json) {
        this.log(JSON.stringify(diff, null, 2));
      } else {
        this.log(diff.diffMarkdown || diff.summaryMarkdown || `${diff.classification} diff`);
      }

      if (flags["fail-on-breaking"] && diff.hasBreaking) {
        this.exit(2);
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
