#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { compareOpenApiSpecs, initialDiff } from "./diff-engine.js";

export { compareOpenApiSpecs, initialDiff } from "./diff-engine.js";
export { DiffEngineClassification } from "./types.js";
export type { DiffEngineInput, DiffEngineResult, DiffJson, DiffChange } from "./types.js";

type CliOptions = {
  readonly command: "diff";
  readonly basePath: string;
  readonly revisionPath: string;
  readonly format: "json";
};

if (process.argv[1] !== undefined && import.meta.url === new URL(process.argv[1], "file://").href) {
  void runCli(process.argv.slice(2));
}

async function runCli(args: readonly string[]): Promise<void> {
  try {
    const options = parseArgs(args);
    const [baseSpec, revisionSpec] = await Promise.all([readFile(options.basePath, "utf8"), readFile(options.revisionPath, "utf8")]);
    const result = await compareOpenApiSpecs({ baseSpec, revisionSpec });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    if (error instanceof CliError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

function parseArgs(args: readonly string[]): CliOptions {
  const command = args[0];
  if (command !== "diff") {
    throw new CliError("usage: diff --base <file> --revision <file> --format json");
  }
  const basePath = readFlag(args, "--base");
  const revisionPath = readFlag(args, "--revision");
  const format = readFlag(args, "--format") ?? "json";
  if (basePath === null || revisionPath === null || format !== "json") {
    throw new CliError("usage: diff --base <file> --revision <file> --format json");
  }
  return { command, basePath, revisionPath, format };
}

function readFlag(args: readonly string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index < 0) {
    return null;
  }
  return args[index + 1] ?? null;
}

class CliError extends Error {}

void initialDiff;
