import { Injectable } from "@nestjs/common";
import { compareOpenApiSpecs, initialDiff, type DiffEngineResult } from "@bumd/diff-engine";
import type { DeployDiffEngine } from "./deploy-ports.js";

@Injectable()
export class OasdiffDeployDiffEngine implements DeployDiffEngine {
  public async compareOpenApiSpecs(input: {
    readonly baseSpec: string;
    readonly revisionSpec: string;
  }): Promise<DiffEngineResult> {
    return compareOpenApiSpecs(input);
  }

  public initialDiff(): DiffEngineResult {
    return initialDiff();
  }
}
