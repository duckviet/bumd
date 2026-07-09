import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

const authStateSchema = z.object({
  apiUrl: z.string().url(),
  organizationSlug: z.string().min(1),
  token: z.string().min(1),
  tokenPrefix: z.string().min(1),
});

export type AuthState = z.infer<typeof authStateSchema>;

export async function readAuthState(): Promise<AuthState | null> {
  try {
    const raw = await readFile(authStatePath(), "utf8");
    const parsed = authStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeAuthState(state: AuthState): Promise<void> {
  const path = authStatePath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

export async function clearAuthState(): Promise<void> {
  await rm(authStatePath(), { force: true });
}

function authStatePath(): string {
  const configHome = process.env["BUMD_CONFIG_HOME"] ?? join(homedir(), ".config", "bumd");
  return join(configHome, "auth.json");
}
