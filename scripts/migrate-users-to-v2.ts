import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

interface UserRecord {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  deleted_at?: string;
}

function getOption(name: string): string | undefined {
  const optionIndex = process.argv.indexOf(name);
  return optionIndex >= 0 ? process.argv[optionIndex + 1] : undefined;
}

function getAttribute(
  attributes: { Name?: string; Value?: string }[] | undefined,
  name: string,
): string | undefined {
  return attributes?.find((attribute) => attribute.Name === name)?.Value;
}

async function main() {
  if (process.env.AWS_PROFILE !== "aes") {
    throw new Error('Set AWS_PROFILE to "aes" before running this script.');
  }

  const userPoolId =
    getOption("--user-pool-id") || process.env.COGNITO_USER_POOL_V2_ID;
  if (!userPoolId) {
    throw new Error(
      "Provide the V2 pool ID with --user-pool-id or COGNITO_USER_POOL_V2_ID.",
    );
  }

  const dryRun = process.argv.includes("--dry-run");
  const region = process.env.AWS_REGION || "us-east-2";
  const cognito = new CognitoIdentityProviderClient({ region });
  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  const users: UserRecord[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await dynamo.send(
      new ScanCommand({
        TableName: "aes_users",
        FilterExpression: "attribute_not_exists(deleted_at)",
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    users.push(...((response.Items ?? []) as UserRecord[]));
    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey);

  let created = 0;
  let existing = 0;

  for (const user of users) {
    try {
      const current = await cognito.send(
        new AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: user.email,
        }),
      );
      const legacyUserId = getAttribute(
        current.UserAttributes,
        "custom:user_id",
      );
      if (legacyUserId !== user.user_id) {
        throw new Error(
          `V2 user ${user.email} already exists with custom:user_id ${legacyUserId ?? "<missing>"}; expected ${user.user_id}.`,
        );
      }
      existing += 1;
      console.log(`Existing: ${user.email}`);
      continue;
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "UserNotFoundException") {
        throw error;
      }
    }

    if (dryRun) {
      created += 1;
      console.log(`Would create: ${user.email}`);
      continue;
    }

    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: user.email,
        MessageAction: "SUPPRESS",
        UserAttributes: [
          { Name: "email", Value: user.email },
          { Name: "email_verified", Value: "true" },
          { Name: "given_name", Value: user.first_name },
          { Name: "family_name", Value: user.last_name },
          { Name: "custom:user_id", Value: user.user_id },
        ],
      }),
    );
    created += 1;
    console.log(`Created: ${user.email}`);
  }

  console.log(
    `${dryRun ? "Dry run: " : ""}${users.length} active users checked; ${created} ${dryRun ? "would be created" : "created"}, ${existing} already migrated.`,
  );
}

await main();
