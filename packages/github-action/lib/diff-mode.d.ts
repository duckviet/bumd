import type { AuthenticatedActionInputs } from "./oidc-token.js";
export declare class ActionConfigurationError extends Error {
    constructor(message: string);
}
export declare function runDiffMode(inputs: AuthenticatedActionInputs): Promise<void>;
