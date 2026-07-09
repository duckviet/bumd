import { Args, Command, Flags } from "@oclif/core";
import { readAuthState } from "../auth/auth-store.js";
import { CatalogClientError, fetchJobStatus, fetchVersion } from "../deploy/catalog-client.js";
import { ProjectConfigError, resolveCliContext } from "../config/project-config.js";

export default class Status extends Command {
  public static override description = "Show the status of a deploy job or deployed version";

  public static override args = {
    jobId: Args.string({ description: "Deploy job ID" }),
  };

  public static override flags = {
    "api-url": Flags.string({ description: "Base API URL" }),
    org: Flags.string({ description: "Organization slug" }),
    doc: Flags.string({ description: "Documentation slug" }),
    branch: Flags.string({ description: "Branch slug" }),
    version: Flags.string({ description: "Version ID" }),
    json: Flags.boolean({ default: false, description: "Print JSON output" }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Status);
    const storedAuth = await readAuthState();
    const token = process.env["BUMD_API_TOKEN"] ?? storedAuth?.token;

    if (token === undefined) {
      this.error("Missing API token. Run `bumd auth login` or set BUMD_API_TOKEN.", { exit: 1 });
    }

    try {
      if (args.jobId) {
        const apiUrl = flags["api-url"] ?? process.env["BUMD_API_URL"] ?? "http://localhost:3000";
        const orgSlug = flags.org ?? process.env["BUMD_ORG"];
        if (!orgSlug) {
          this.error("Missing org. Pass --org, set BUMD_ORG, or run bumd init.", { exit: 1 });
        }

        const job = await fetchJobStatus({
          apiUrl,
          orgSlug,
          jobId: args.jobId,
          token,
        });

        if (flags.json) {
          this.log(JSON.stringify(job, null, 2));
          return;
        }

        this.log(`${job.id} ${job.status} ${job.type}`);
        return;
      }

      const context = await resolveCliContext({
        apiUrl: flags["api-url"],
        org: flags.org,
        doc: flags.doc,
        branch: flags.branch,
      });

      if (!flags.version) {
        this.error("Missing version ID. Pass a deploy job ID or --version.", { exit: 1 });
      }

      const version = await fetchVersion({
        apiUrl: context.apiUrl,
        orgSlug: context.org,
        docSlug: context.doc,
        branchSlug: context.branch,
        versionId: flags.version,
        token,
      });

      if (flags.json) {
        this.log(JSON.stringify(version, null, 2));
        return;
      }

      this.log(`${version.id} ${version.status} ${version.sha256}`);
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
