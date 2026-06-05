import * as core from "@actions/core";
import { formatActionError, runAction } from "./run-action.js";

try {
  await runAction();
} catch (error) {
  core.setFailed(formatActionError(error));
}
