import type { ActionInputs } from "./action-inputs.js";
export type AuthenticatedActionInputs = ActionInputs & {
    readonly backendToken: string;
};
export declare function resolveBackendToken(inputs: ActionInputs): Promise<AuthenticatedActionInputs>;
