import { createReadStream } from "node:fs";
import { access, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertSafeKey, type StorageProvider } from "./types";

/** Stores files on the local disk (no external service needed). */
export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string) {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Chemin de stockage invalide");
    return full;
  }

  async put(key: string, body: Buffer) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async get(key: string) {
    return readFile(this.resolve(key));
  }

  async getStream(key: string) {
    const file = this.resolve(key);
    const info = await stat(file);
    return { stream: createReadStream(file), size: info.size };
  }

  async exists(key: string) {
    try {
      await access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }

  async deletePrefix(prefix: string) {
    await rm(this.resolve(prefix.replace(/\/+$/, "")), { recursive: true, force: true });
  }

  async *listKeys(prefix = "") {
    const walk = async function* (dir: string, base: string): AsyncGenerator<string> {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const key = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) yield* walk(path.join(dir, entry.name), key);
        else yield key;
      }
    };
    for await (const key of walk(this.root, "")) if (key.startsWith(prefix)) yield key;
  }

  async healthcheck() {
    await mkdir(this.root, { recursive: true });
  }
}
