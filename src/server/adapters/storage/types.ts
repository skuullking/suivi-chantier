import type { Readable } from "node:stream";

export type StoredObject = { stream: Readable; size?: number; contentType?: string };

export interface StorageProvider {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  getStream(key: string): Promise<StoredObject>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Deletes every object under a prefix (organization deletion). */
  deletePrefix(prefix: string): Promise<void>;
  healthcheck(): Promise<void>;
}

/** Object keys only contain safe characters; never user-provided paths. */
export function assertSafeKey(key: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error(`Clé de stockage invalide : ${key}`);
  }
}
