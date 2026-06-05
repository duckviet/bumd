import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class OasdiffProcessError extends Error {
  public constructor(
    message: string,
    public readonly code: number | null,
    public readonly stderr: string,
  ) {
    super(message);
  }
}

export class OasdiffUnavailableError extends Error {
  public constructor(message: string) {
    super(message);
  }
}

export type OasdiffRawOutput = {
  readonly diffJson: unknown;
  readonly changelogMarkdown: string;
};

export async function runOasdiff(input: {
  readonly baseSpec: string;
  readonly revisionSpec: string;
  readonly binaryPath: string;
  readonly timeoutMs: number;
}): Promise<OasdiffRawOutput> {
  const tempDir = await mkdtemp(join(tmpdir(), "bumd-oasdiff-"));
  try {
    const basePath = join(tempDir, "base.yaml");
    const revisionPath = join(tempDir, "revision.yaml");
    await Promise.all([writeFile(basePath, input.baseSpec), writeFile(revisionPath, input.revisionSpec)]);
    const diff = await execOasdiff(input.binaryPath, ["diff", basePath, revisionPath, "-f", "json"], input.timeoutMs);
    const changelog = await execOasdiff(
      input.binaryPath,
      ["changelog", basePath, revisionPath, "-f", "markdown"],
      input.timeoutMs,
    );
    const trimmedDiff = diff.trim();
    return {
      diffJson: trimmedDiff.length === 0 ? { changes: [] } : JSON.parse(trimmedDiff),
      changelogMarkdown: changelog.trim(),
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function execOasdiff(binaryPath: string, args: readonly string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(binaryPath, args, { timeout: timeoutMs, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error === null) {
        resolve(stdout);
        return;
      }
      if ("code" in error && error.code === "ENOENT") {
        reject(new OasdiffUnavailableError(`oasdiff binary not found at ${binaryPath}`));
        return;
      }
      const exitCode = typeof error.code === "number" ? error.code : null;
      reject(new OasdiffProcessError("oasdiff command failed", exitCode, stderr));
    });
    child.stdin?.end();
  });
}
