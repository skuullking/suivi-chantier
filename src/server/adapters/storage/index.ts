import { env } from "@/server/env";
import { LocalStorageProvider } from "./local";
import { S3StorageProvider } from "./s3";
import type { StorageProvider } from "./types";

export type { StorageProvider, StoredObject } from "./types";

let instance: StorageProvider | undefined;

export function storage(): StorageProvider {
  if (!instance) {
    const e = env();
    instance =
      e.STORAGE_DRIVER === "s3"
        ? new S3StorageProvider({
            endpoint: e.S3_ENDPOINT,
            region: e.S3_REGION,
            bucket: e.S3_BUCKET,
            accessKeyId: e.S3_ACCESS_KEY_ID,
            secretAccessKey: e.S3_SECRET_ACCESS_KEY,
            forcePathStyle: e.S3_FORCE_PATH_STYLE,
          })
        : new LocalStorageProvider(e.STORAGE_LOCAL_DIR);
  }
  return instance;
}

export function setStorageProvider(provider: StorageProvider | undefined) {
  instance = provider;
}
