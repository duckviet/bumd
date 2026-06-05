import { classificationFor, classifyOpenApiSpecs } from "./classifier.js";
import { initialDiff, renderMarkdown } from "./markdown.js";
import { OasdiffUnavailableError, runOasdiff } from "./oasdiff-runner.js";
import { DiffEngineClassification, type DiffEngineInput, type DiffEngineResult } from "./types.js";

const DefaultTimeoutMs = 30_000;
const DefaultBinaryPath = "oasdiff";

export async function compareOpenApiSpecs(input: DiffEngineInput): Promise<DiffEngineResult> {
  const changes = classifyOpenApiSpecs(input.baseSpec, input.revisionSpec);
  const classification = changes.length === 0 ? DiffEngineClassification.None : classificationFor(changes);
  const computedMarkdown = renderMarkdown(classification, changes);
  const raw = await readOasdiffOutput(input);
  const markdown = raw.changelogMarkdown.length > 0 ? `${computedMarkdown}\n\n${raw.changelogMarkdown}` : computedMarkdown;
  return {
    classification,
    hasBreaking: classification === DiffEngineClassification.Breaking,
    diffJson: {
      changes,
      oasdiff: raw.diffJson,
    },
    markdown,
  };
}

export { initialDiff };

async function readOasdiffOutput(input: DiffEngineInput): Promise<{
  readonly diffJson: unknown;
  readonly changelogMarkdown: string;
}> {
  try {
    return await runOasdiff({
      baseSpec: input.baseSpec,
      revisionSpec: input.revisionSpec,
      binaryPath: input.binaryPath ?? DefaultBinaryPath,
      timeoutMs: input.timeoutMs ?? DefaultTimeoutMs,
    });
  } catch (error) {
    if (error instanceof OasdiffUnavailableError) {
      return { diffJson: { unavailable: true }, changelogMarkdown: "" };
    }
    throw error;
  }
}
