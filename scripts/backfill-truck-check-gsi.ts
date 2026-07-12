import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

process.env.AWS_PROFILE = "aes";

interface TruckCheckRecord {
  id: string;
  list_pk?: string;
}

function getOption(name: string): string | undefined {
  const optionIndex = process.argv.indexOf(name);
  return optionIndex >= 0 ? process.argv[optionIndex + 1] : undefined;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const region = process.env.AWS_REGION || "us-east-2";
  const tableName = getOption("--table") || "aes_truck_checks";
  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  let exclusiveStartKey: Record<string, unknown> | undefined;
  let changed = 0;
  let unchanged = 0;

  do {
    const response = await dynamo.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: "id, list_pk",
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    const items = (response.Items ?? []) as TruckCheckRecord[];
    for (const item of items) {
      if (item.list_pk === "TRUCK_CHECK") {
        unchanged += 1;
        continue;
      }

      if (!dryRun) {
        await dynamo.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { id: item.id },
            UpdateExpression: "SET list_pk = :list_pk",
            ExpressionAttributeValues: {
              ":list_pk": "TRUCK_CHECK",
            },
          }),
        );
      }
      changed += 1;
    }
    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey);

  console.log(`Changed: ${changed}`);
  console.log(`Unchanged: ${unchanged}`);
  if (dryRun) {
    console.log("Dry run complete; no changes written.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
