import { Command, Flags } from "@oclif/core";
import { ProjectConfigError, resolveAppUrl, resolveCliContext } from "../../config/project-config.js";

export default class DocsOpen extends Command {
  public static override description = "Print the public documentation URL";

  public static override flags = {
    "api-url": Flags.string({ description: "Base API URL" }),
    "app-url": Flags.string({ description: "Frontend app URL" }),
    org: Flags.string({ description: "Organization slug" }),
    doc: Flags.string({ description: "Documentation slug" }),
    branch: Flags.string({ description: "Branch slug" }),
    json: Flags.boolean({ default: false, description: "Print JSON output" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(DocsOpen);

    try {
      const context = await resolveCliContext({
        apiUrl: flags["api-url"],
        org: flags.org,
        doc: flags.doc,
        branch: flags.branch,
      });
      const appUrl = await resolveAppUrl({ appUrl: flags["app-url"] });
      const url = publicDocsUrl(appUrl, context.org, context.doc, context.branch);

      if (flags.json) {
        this.log(JSON.stringify({ url }, null, 2));
        return;
      }

      this.log(url);
    } catch (error) {
      if (error instanceof ProjectConfigError) {
        this.error(error.message, { exit: 1 });
      }

      throw error;
    }
  }
}

function publicDocsUrl(appUrl: string, org: string, doc: string, branch: string): string {
  const path = `/${encodeURIComponent(org)}/${encodeURIComponent(doc)}/${encodeURIComponent(branch)}`;
  return new URL(path, appUrl).toString();
}
