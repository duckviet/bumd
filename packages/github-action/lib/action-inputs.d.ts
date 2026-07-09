import { z } from "zod";
export declare const ActionCommand: {
    readonly Deploy: "deploy";
    readonly Diff: "diff";
};
export type ActionCommand = (typeof ActionCommand)[keyof typeof ActionCommand];
declare const inputSchema: z.ZodObject<{
    command: z.ZodUnion<readonly [z.ZodLiteral<"deploy">, z.ZodLiteral<"diff">]>;
    apiUrl: z.ZodString;
    orgSlug: z.ZodString;
    docSlug: z.ZodString;
    branchSlug: z.ZodString;
    filePath: z.ZodString;
    sourceFormat: z.ZodOptional<z.ZodString>;
    backendToken: z.ZodOptional<z.ZodString>;
    authMode: z.ZodEnum<{
        token: "token";
        oidc: "oidc";
    }>;
    githubToken: z.ZodOptional<z.ZodString>;
    versionId: z.ZodOptional<z.ZodString>;
    baseVersionId: z.ZodOptional<z.ZodString>;
    headVersionId: z.ZodOptional<z.ZodString>;
    failOnBreaking: z.ZodBoolean;
    stickyComment: z.ZodBoolean;
}, z.core.$strip>;
export type ActionInputs = z.infer<typeof inputSchema>;
export declare function readActionInputs(): ActionInputs;
export {};
