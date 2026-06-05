import type { ActionInputs } from "./action-inputs.js";
export declare class ActionConfigurationError extends Error {
    constructor(message: string);
}
export declare function runDiffMode(inputs: ActionInputs): Promise<void>;
