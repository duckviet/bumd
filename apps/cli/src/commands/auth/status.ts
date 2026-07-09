import { Command, Flags } from "@oclif/core";
import { readAuthState } from "../../auth/auth-store.js";

export default class AuthStatus extends Command {
  public static readonly description = "Show Bumd CLI authentication status";

  public static readonly flags = {
    json: Flags.boolean({ default: false }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AuthStatus);
    const state = await readAuthState();
    const output = {
      authenticated: state !== null,
      apiUrl: state?.apiUrl ?? null,
      organizationSlug: state?.organizationSlug ?? null,
      tokenPrefix: state?.tokenPrefix ?? null,
    };
    if (flags.json) {
      this.log(JSON.stringify(output));
      return;
    }
    this.log(output.authenticated ? `Authenticated to ${output.apiUrl} as ${output.organizationSlug}` : "Not authenticated");
  }
}
