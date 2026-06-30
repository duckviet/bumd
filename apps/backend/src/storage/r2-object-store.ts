import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Injectable, Logger } from "@nestjs/common";
import type { ObjectStore } from "./object-store-port.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

@Injectable()
export class R2ObjectStore implements ObjectStore {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly logger = new Logger(R2ObjectStore.name);

  public constructor() {
    const accountId = requireEnv("CDN_ACCOUNT_ID");
    this.bucket = requireEnv("CDN_BUCKET_NAME");

    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv("CDN_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("CDN_SECRET_ACCESS_KEY"),
      },
    });

    this.logger.log(`R2ObjectStore initialized — bucket: ${this.bucket}`);
  }

  public async put(key: string, body: string): Promise<void> {
    this.logger.log(`PUT ${key} (${body.length} chars)`);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: "text/plain; charset=utf-8",
      }),
    );
    this.logger.log(`PUT ${key} OK`);
  }

  public async get(key: string): Promise<string> {
    this.logger.log(`GET ${key}`);
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    if (response.Body === undefined) {
      this.logger.error(`GET ${key} — body undefined`);
      throw new Error(`object_not_found: ${key}`);
    }

    const content = await response.Body.transformToString("utf-8");
    this.logger.log(`GET ${key} OK (${content.length} chars)`);
    return content;
  }
}
