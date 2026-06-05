import * as core from "@actions/core";
import { z } from "zod";
export const ActionCommand = {
    Deploy: "deploy",
    Diff: "diff",
};
const inputSchema = z.object({
    command: z.union([z.literal(ActionCommand.Deploy), z.literal(ActionCommand.Diff)]),
    apiUrl: z.string().url(),
    orgSlug: z.string().min(1),
    docSlug: z.string().min(1),
    branchSlug: z.string().min(1),
    filePath: z.string().min(1),
    sourceFormat: z.string().optional(),
    backendToken: z.string().min(1),
    githubToken: z.string().optional(),
    versionId: z.string().optional(),
    baseVersionId: z.string().optional(),
    headVersionId: z.string().optional(),
    failOnBreaking: z.boolean(),
    stickyComment: z.boolean(),
});
export function readActionInputs() {
    const backendToken = requiredInput("backend_token");
    maskSecret(backendToken);
    const githubToken = optionalInput("github_token");
    if (githubToken !== undefined) {
        maskSecret(githubToken);
    }
    return inputSchema.parse({
        command: requiredInput("command"),
        apiUrl: requiredInput("api_url"),
        orgSlug: requiredInput("org"),
        docSlug: requiredInput("doc"),
        branchSlug: optionalInput("branch") ?? "main",
        filePath: requiredInput("file"),
        sourceFormat: optionalInput("source_format"),
        backendToken,
        githubToken,
        versionId: optionalInput("version_id"),
        baseVersionId: optionalInput("base_version_id"),
        headVersionId: optionalInput("head_version_id"),
        failOnBreaking: booleanInput("fail_on_breaking"),
        stickyComment: booleanInput("sticky_comment", true),
    });
}
function maskSecret(value) {
    if (process.env["GITHUB_ACTIONS"] === "true") {
        core.setSecret(value);
    }
}
function requiredInput(name) {
    return core.getInput(name, { required: true, trimWhitespace: true });
}
function optionalInput(name) {
    const value = core.getInput(name, { trimWhitespace: true });
    return value === "" ? undefined : value;
}
function booleanInput(name, fallback = false) {
    const value = core.getInput(name, { trimWhitespace: true });
    if (value === "") {
        return fallback;
    }
    return value.toLowerCase() === "true";
}
