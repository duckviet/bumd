export const OBJECT_STORE = Symbol("OBJECT_STORE");

export type ObjectStore = {
  readonly put: (key: string, body: string) => Promise<void>;
  readonly get: (key: string) => Promise<string>;
};
