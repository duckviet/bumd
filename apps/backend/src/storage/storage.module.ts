import { Module } from "@nestjs/common";
import { OBJECT_STORE } from "./object-store-port.js";
import { R2ObjectStore } from "./r2-object-store.js";

class InMemoryObjectStore {
  private readonly storage = new Map<string, string>();
  public async put(key: string, body: string): Promise<void> {
    this.storage.set(key, body);
  }
  public async get(key: string): Promise<string> {
    const val = this.storage.get(key);
    if (val === undefined) {
      throw new Error(`object_not_found: ${key}`);
    }
    return val;
  }
}

@Module({
  providers: [
    InMemoryObjectStore,
    {
      provide: OBJECT_STORE,
      inject: [InMemoryObjectStore],
      useFactory: (inMemory: InMemoryObjectStore) => {
        if (
          process.env["DEPLOY_STORE"] === "memory" ||
          process.env["CDN_ACCOUNT_ID"] === "test_account_not_secret" ||
          process.env["CDN_ACCOUNT_ID"] === undefined ||
          process.env["CDN_ACCOUNT_ID"].trim() === ""
        ) {
          return inMemory;
        }
        return new R2ObjectStore();
      },
    },
  ],
  exports: [OBJECT_STORE],
})
export class StorageModule {}
