import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

process.env.AWS_PROFILE = "aes";

interface EmailEventRecord {
  message_id: string;
  to_emails?: string[];
  recipient_email?: string;
}

// Must match toRecipientKey in app/lib/email-event-store.ts. Inlined so the
// script doesn't pull in the app's X-Ray instrumentation.
function toRecipientKey(toEmails: string[]): string | undefined {
  const normalized = toEmails[0]?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function getOption(name: string): string | undefined {
  const optionIndex = process.argv.indexOf(name);
  return optionIndex >= 0 ? process.argv[optionIndex + 1] : undefined;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const region = process.env.AWS_REGION || "us-east-2";
  const tableName = getOption("--table") || "aes_email_events";
  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  let exclusiveStartKey: Record<string, unknown> | undefined;
  let changed = 0;
  let unchanged = 0;
  let skipped = 0;

  do {
    const response = await dynamo.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: "message_id, to_emails, recipient_email",
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    const items = (response.Items ?? []) as EmailEventRecord[];
    for (const item of items) {
      const recipientEmail = toRecipientKey(item.to_emails ?? []);
      if (!recipientEmail) {
        skipped += 1;
        continue;
      }
      if (item.recipient_email === recipientEmail) {
        unchanged += 1;
        continue;
      }

      if (!dryRun) {
        await dynamo.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { message_id: item.message_id },
            UpdateExpression: "SET recipient_email = :recipient_email",
            ConditionExpression: "attribute_exists(message_id)",
            ExpressionAttributeValues: {
              ":recipient_email": recipientEmail,
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
  console.log(`Skipped (no recipient): ${skipped}`);
  if (dryRun) {
    console.log("Dry run complete; no changes written.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
