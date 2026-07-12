import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

process.env.AWS_PROFILE = "aes";

interface ContributorRecord {
  first_name: string;
  last_name: string;
}

interface UserRecord {
  user_id: string;
  first_name: string;
  last_name: string;
}

interface TruckCheckRecord {
  id: string;
  contributors?: string[] | Record<string, ContributorRecord>;
  created_by?: string;
}

function getOption(name: string): string | undefined {
  const optionIndex = process.argv.indexOf(name);
  return optionIndex >= 0 ? process.argv[optionIndex + 1] : undefined;
}

function isContributorRecord(value: unknown): value is ContributorRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "first_name" in value &&
    typeof value.first_name === "string" &&
    "last_name" in value &&
    typeof value.last_name === "string"
  );
}

function normalizeContributorIds(truckCheck: TruckCheckRecord): string[] {
  if (Array.isArray(truckCheck.contributors)) {
    return truckCheck.contributors;
  }

  if (
    truckCheck.contributors &&
    typeof truckCheck.contributors === "object" &&
    Object.values(truckCheck.contributors).every(isContributorRecord)
  ) {
    return Object.keys(truckCheck.contributors);
  }

  return truckCheck.created_by ? [truckCheck.created_by] : [];
}

async function getUserContributor({
  dynamo,
  userId,
  usersTableName,
}: {
  dynamo: DynamoDBDocumentClient;
  userId: string;
  usersTableName: string;
}): Promise<ContributorRecord> {
  const response = await dynamo.send(
    new GetCommand({
      TableName: usersTableName,
      Key: { user_id: userId },
    }),
  );
  const user = response.Item as UserRecord | undefined;
  if (!user) {
    return { first_name: "Unknown", last_name: "" };
  }

  return {
    first_name: user.first_name,
    last_name: user.last_name,
  };
}

async function main() {
  if (process.env.AWS_PROFILE !== "aes") {
    throw new Error('Set AWS_PROFILE to "aes" before running this script.');
  }

  const dryRun = process.argv.includes("--dry-run");
  const region = process.env.AWS_REGION || "us-east-2";
  const truckChecksTableName =
    getOption("--truck-checks-table") || "aes_truck_checks";
  const usersTableName = getOption("--users-table") || "aes_users";
  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  const truckChecks: TruckCheckRecord[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await dynamo.send(
      new ScanCommand({
        TableName: truckChecksTableName,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    truckChecks.push(...((response.Items ?? []) as TruckCheckRecord[]));
    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey);

  let changed = 0;
  let unchanged = 0;

  for (const truckCheck of truckChecks) {
    const contributorIds = [...new Set(normalizeContributorIds(truckCheck))];
    const contributors = Object.fromEntries(
      await Promise.all(
        contributorIds.map(async (userId) => [
          userId,
          await getUserContributor({ dynamo, userId, usersTableName }),
        ]),
      ),
    );

    if (
      JSON.stringify(truckCheck.contributors ?? {}) ===
      JSON.stringify(contributors)
    ) {
      unchanged += 1;
      continue;
    }

    changed += 1;
    console.log(
      `${dryRun ? "Would update" : "Updating"} truck check ${truckCheck.id} with ${contributorIds.length} contributor(s).`,
    );

    if (dryRun) {
      continue;
    }

    await dynamo.send(
      new PutCommand({
        TableName: truckChecksTableName,
        Item: {
          ...truckCheck,
          contributors,
          updated_at: new Date().toISOString(),
        },
      }),
    );
  }

  console.log(
    `${dryRun ? "Dry run: " : ""}${truckChecks.length} truck checks scanned; ${changed} ${dryRun ? "would be updated" : "updated"}, ${unchanged} unchanged.`,
  );
}

await main();
