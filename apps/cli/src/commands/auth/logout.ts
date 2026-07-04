import { Command } from "@oclif/core";
import { clearAuthState } from "../../auth/auth-store.js";

export default class AuthLogout extends Command {
  public static readonly description = "Remove the stored Bumd CLI token";

  public async run(): Promise<void> {
    await clearAuthState();
    this.log("Logged out");
  }
}
