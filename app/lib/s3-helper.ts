import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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

  getFileUrl(key: string): string {
    return `${this.cloudFrontDomain}/${key}`;
  }
}
