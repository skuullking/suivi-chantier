import { type Readable } from "node:stream";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { assertSafeKey, type StorageProvider } from "./types";

export type S3Config = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
};

/** S3-compatible storage (MinIO locally, any EU S3 provider in production). Objects are private. */
export class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  private client: S3Client;
  private bucketReady: Promise<void> | undefined;

  constructor(private readonly config: S3Config) {
    this.client = new S3Client({
      endpoint: config.endpoint || undefined,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
          : undefined,
    });
  }

  private ensureBucket() {
    this.bucketReady ??= (async () => {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
      } catch {
        await this.client.send(new CreateBucketCommand({ Bucket: this.config.bucket }));
      }
    })().catch((error) => {
      this.bucketReady = undefined;
      throw error;
    });
    return this.bucketReady;
  }

  async put(key: string, body: Buffer, contentType: string) {
    assertSafeKey(key);
    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string) {
    const { stream } = await this.getStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  }

  async getStream(key: string) {
    assertSafeKey(key);
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
    return {
      stream: out.Body as Readable,
      size: out.ContentLength,
      contentType: out.ContentType,
    };
  }

  async exists(key: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string) {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  async deletePrefix(prefix: string) {
    let token: string | undefined;
    do {
      const list = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.config.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      const objects = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (objects.length) {
        await this.client.send(
          new DeleteObjectsCommand({ Bucket: this.config.bucket, Delete: { Objects: objects } }),
        );
      }
      token = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (token);
  }

  async healthcheck() {
    await this.ensureBucket();
  }
}
