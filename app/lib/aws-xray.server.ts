import AWSXRay from "aws-xray-sdk-core";

type AwsSdkV3Client = Parameters<typeof AWSXRay.captureAWSv3Client>[0];

export function instrumentAwsSdkClient<T extends AwsSdkV3Client>(client: T): T {
  return process.env.AWS_LAMBDA_FUNCTION_NAME
    ? AWSXRay.captureAWSv3Client(client)
    : client;
}
