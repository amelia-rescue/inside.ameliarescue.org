import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  type _Object,
  ListObjectVersionsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export class S3Helper {
  private client: S3Client;
  private bucketName: string;
  private cloudFrontDomain: string;

  constructor(client: S3Client, bucketName: string, cloudFrontDomain: string) {
    this.client = client;
    this.bucketName = bucketName;
    this.cloudFrontDomain = cloudFrontDomain;
  }

  static make(): S3Helper {
    const client = new S3Client({});
    const bucketName = process.env.FILE_UPLOADS_BUCKET_NAME!;
    const cloudFrontDomain = process.env.FILE_CDN_URL!;
    return new S3Helper(client, bucketName, cloudFrontDomain);
  }

  /**
   * list all of the objects in the /documents directory
   */
  async listDocuments(): Promise<{ url: URL; key: string; name: string }[]> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: "files/documents",
    });
    const response = await this.client.send(command);
    if (!response.Contents) {
      return [];
    }
    const keys = response.Contents.map((obj) => obj.Key).filter(
      (key): key is string =>
        typeof key === "string" && key !== "files/documents/",
    );
    return keys.map((key) => {
      const url = new URL(`https://inside.ameliarescue.org/${key}`);
      const fileName = key.split("/").pop() || "";
      const name = fileName.replace(/\.[^/.]+$/, "");
      return {
        url,
        key,
        name,
      };
    });
  }

  /** list all the versions of a particular key */
  async listObjectVersions(prefix: string) {
    let versions: _Object[] = [];
    const command = new ListObjectVersionsCommand({
      Bucket: this.bucketName,
      Prefix: prefix,
    });
    const response = await this.client.send(command);
    return response.Versions || [];
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn: number = 300,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });
    return url;
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    await this.client.send(command);
  }

  getFileUrl(key: string): string {
    return `${this.cloudFrontDomain}/${key}`;
  }
}
