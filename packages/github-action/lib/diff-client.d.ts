import type { AuthenticatedActionInputs } from "./oidc-token.js";
export declare const DiffClassification: {
    readonly None: "none";
    readonly NonBreaking: "non_breaking";
    readonly Breaking: "breaking";
    readonly Warning: "warning";
    readonly Unknown: "unknown";
};
export type DiffClassification = (typeof DiffClassification)[keyof typeof DiffClassification];
export type ActionDiffResult = {
    readonly classification: DiffClassification;
    readonly hasBreaking: boolean;
    readonly markdown: string;
};
export declare class DiffClientError extends Error {
    constructor(message: string);
}
export declare function fetchDiffResult(inputs: AuthenticatedActionInputs): Promise<ActionDiffResult>;
