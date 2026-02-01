import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({});

let cachedSessionSecret: string | null = null;

/**
 * Get the session secret from AWS Secrets Manager
 * Caches the value after first retrieval for performance
 */
export async function getSessionSecret(): Promise<string> {
  if (cachedSessionSecret) {
    return cachedSessionSecret;
  }

  const secretArn = process.env.SESSION_SECRET_ARN;

  if (!secretArn) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET_ARN environment variable is not set");
    }
    console.warn(
      "SESSION_SECRET_ARN not set, using fallback for local development",
    );
    return process.env.SESSION_SECRET || "default-secret-change-in-production";
  }

  try {
    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: secretArn,
      }),
    );

    if (!response.SecretString) {
      throw new Error("Secret value is empty");
    }

    const secretData = JSON.parse(response.SecretString);
    cachedSessionSecret = secretData.secret;

    if (!cachedSessionSecret) {
      throw new Error("Secret key 'secret' not found in secret data");
    }

    return cachedSessionSecret;
  } catch (error) {
    console.error(
      "Failed to retrieve session secret from Secrets Manager:",
      error,
    );
    throw error;
  }
}
