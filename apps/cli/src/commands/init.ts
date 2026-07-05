import { Command, Flags } from "@oclif/core";
import { writeProjectConfig } from "../config/project-config.js";

export default class Init extends Command {
  public static override description = "Create a project-local Bumd CLI config";

  public static override flags = {
    "api-url": Flags.string({ required: true, description: "Base API URL" }),
    "app-url": Flags.string({ default: "http://localhost:3000", description: "Frontend app URL" }),
    org: Flags.string({ required: true, description: "Organization slug" }),
    doc: Flags.string({ required: true, description: "Documentation slug" }),
    branch: Flags.string({ required: true, description: "Branch slug" }),
    json: Flags.boolean({ default: false, description: "Print JSON output" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Init);
    const config = {
      apiUrl: flags["api-url"],
      appUrl: flags["app-url"],
      org: flags.org,
      doc: flags.doc,
      branch: flags.branch,
    };

    await writeProjectConfig(config);

    if (flags.json) {
      this.log(JSON.stringify(config, null, 2));
      return;
    }

    this.log("Wrote .bumd.json");
  }
}
