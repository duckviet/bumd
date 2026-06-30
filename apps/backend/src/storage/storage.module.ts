import { Module } from "@nestjs/common";
import { OBJECT_STORE } from "./object-store-port.js";
import { R2ObjectStore } from "./r2-object-store.js";

@Module({
  providers: [
    R2ObjectStore,
    { provide: OBJECT_STORE, useExisting: R2ObjectStore },
  ],
  exports: [R2ObjectStore, OBJECT_STORE],
})
export class StorageModule {}
