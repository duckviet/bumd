import type { ActionDiffResult } from "./diff-client.js";
export type StickyCommentResult = {
    readonly commentId: number;
};
export declare class PullRequestContextError extends Error {
    constructor(message: string);
}
export declare function upsertStickyDiffComment(input: {
    readonly githubToken: string;
    readonly diff: ActionDiffResult;
}): Promise<StickyCommentResult>;
