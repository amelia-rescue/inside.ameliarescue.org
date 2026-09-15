import { captureAWSv3Client } from "aws-xray-sdk-core";

type AwsSdkV3Client = Parameters<typeof captureAWSv3Client>[0];

export function instrumentAwsSdkClient<T extends AwsSdkV3Client>(client: T): T {
  return process.env.AWS_LAMBDA_FUNCTION_NAME
    ? captureAWSv3Client(client)
    : client;
}
