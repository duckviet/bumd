import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

const ConfigFileName = ".bumd.json";

const projectConfigSchema = z.object({
  apiUrl: z.string().min(1).optional(),
  appUrl: z.string().min(1).optional(),
  org: z.string().min(1).optional(),
  doc: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

export type CliContext = {
  readonly apiUrl: string;
  readonly org: string;
  readonly doc: string;
  readonly branch: string;
};

export class ProjectConfigError extends Error {
  public constructor(message: string) {
    super(message);
  }
}

export async function readProjectConfig(): Promise<ProjectConfig> {
  try {
    const raw = await readFile(configPath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return projectConfigSchema.parse(parsed);
  } catch (error) {
    if (isMissingFileError(error)) {
      return {};
    }

    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw new ProjectConfigError(`${ConfigFileName} is not a valid Bumd config file`);
    }

    throw error;
  }
}

export async function writeProjectConfig(config: Required<ProjectConfig>): Promise<void> {
  await writeFile(configPath(), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export async function resolveCliContext(input: {
  readonly apiUrl: string | undefined;
  readonly org: string | undefined;
  readonly doc: string | undefined;
  readonly branch: string | undefined;
}): Promise<CliContext> {
  const config = await readProjectConfig();
  const apiUrl = input.apiUrl ?? process.env["BUMD_API_URL"] ?? config.apiUrl;
  const org = input.org ?? process.env["BUMD_ORG"] ?? config.org;
  const doc = input.doc ?? process.env["BUMD_DOC"] ?? config.doc;
  const branch = input.branch ?? process.env["BUMD_BRANCH"] ?? config.branch;

  return {
    apiUrl: requireConfigValue(apiUrl, "api-url"),
    org: requireConfigValue(org, "org"),
    doc: requireConfigValue(doc, "doc"),
    branch: requireConfigValue(branch, "branch"),
  };
}

export async function resolveAppUrl(input: { readonly appUrl: string | undefined }): Promise<string> {
  const config = await readProjectConfig();
  return input.appUrl ?? process.env["BUMD_APP_URL"] ?? config.appUrl ?? "http://localhost:3000";
}

function configPath(): string {
  return resolve(process.cwd(), ConfigFileName);
}

function requireConfigValue(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === "") {
    throw new ProjectConfigError(`Missing ${name}. Pass --${name}, set BUMD_${envName(name)}, or run bumd init.`);
  }

  return value;
}

function envName(name: string): string {
  return name.replaceAll("-", "_").toUpperCase();
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
