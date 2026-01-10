import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import dynalite, { type DynaliteServer } from "dynalite";

export const DYNALITE_ENDPOINT = "http://localhost:10420" as const;
export type DynaliteEndpoint = typeof DYNALITE_ENDPOINT;

export async function setupDynamo(schema: {
  tableName: string;
}): Promise<DynaliteServer> {
  let dynaliteServer: DynaliteServer;

  dynaliteServer = dynalite({
    createTableMs: 0,
  });

  await new Promise<DynaliteServer>((resolve, reject) => {
    dynaliteServer.listen(10420, (err) => {
      if (err) reject(err);
      else resolve(dynaliteServer);
    });
  });

  const dynamoDbClient = new DynamoDBClient({
    endpoint: DYNALITE_ENDPOINT,
    region: "local",
    credentials: {
      accessKeyId: "local",
      secretAccessKey: "local",
    },
  });

  // will this throw if the table already exists?
  await dynamoDbClient.send(
    new CreateTableCommand({
      TableName: schema.tableName,
      KeySchema: [
        {
          AttributeName: "user_id",
          KeyType: "HASH",
        },
      ],
      AttributeDefinitions: [
        {
          AttributeName: "user_id",
          AttributeType: "S",
        },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );

  await Promise.race([
    // 500 ms timeout to create the table
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Table creation timeout")), 500);
    }),

    // poll for table creation every 25ms for 20 attempts (500ms total)
    new Promise(async (resolve) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          const res = await dynamoDbClient.send(
            new DescribeTableCommand({ TableName: schema.tableName }),
          );
          if (
            res.Table?.TableStatus === "ACTIVE" ||
            res.Table?.TableStatus == null
          ) {
            resolve(undefined);
            break;
          }
        } catch {
          // ignore until table exists
        }

        await new Promise((r) => setTimeout(r, 25));
      }
    }),
  ]);

  return dynaliteServer;
}

export async function teardownDynamo(dynaliteServer: DynaliteServer) {
  await new Promise<void>((resolve, reject) => {
    dynaliteServer.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
