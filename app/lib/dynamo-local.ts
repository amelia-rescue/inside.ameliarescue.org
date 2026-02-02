import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import dynalite, { type DynaliteServer } from "dynalite";
import { DYNALITE_ENDPOINT } from "./dynalite-endpont";

export async function setupDynamo() {
  const schemas = [
    {
      tableName: "aes_users",
      partitionKey: "user_id",
    },
    {
      tableName: "aes_roles",
      partitionKey: "name",
    },
    {
      tableName: "aes_tracks",
      partitionKey: "name",
    },
    {
      tableName: "aes_certification_types",
      partitionKey: "name",
    },
    {
      tableName: "aes_user_certifications",
      partitionKey: "certification_id",
      gsi: [
        {
          indexName: "UserIdIndex",
          partitionKey: "user_id",
          sortKey: "uploaded_at",
        },
      ],
    },
    {
      tableName: "aes_certification_reminders",
      partitionKey: "reminder_id",
      gsi: [
        {
          indexName: "UserIdIndex",
          partitionKey: "user_id",
          sortKey: "sent_at",
        },
      ],
    },
    {
      tableName: "aes_certification_snapshots",
      partitionKey: "snapshot_date",
    },
    {
      tableName: "aes_truck_checks",
      partitionKey: "id",
    },
    {
      tableName: "aes_truck_check_schemas",
      partitionKey: "document_key",
      sortKey: "range_key",
    },
  ];

  return await _setupDynamo(...schemas);
}

export async function _setupDynamo(
  ...schemas: Array<{
    tableName: string;
    partitionKey: string;
    sortKey?: string;
    gsi?: Array<{
      indexName: string;
      partitionKey: string;
      sortKey?: string;
    }>;
  }>
): Promise<DynaliteServer> {
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

  for (const schema of schemas) {
    const attributeDefinitions = [
      {
        AttributeName: schema.partitionKey,
        AttributeType: "S",
      },
    ];

    const keySchema = [
      {
        AttributeName: schema.partitionKey,
        KeyType: "HASH",
      },
    ];

    if (schema.sortKey) {
      attributeDefinitions.push({
        AttributeName: schema.sortKey,
        AttributeType: "S",
      });
      keySchema.push({
        AttributeName: schema.sortKey,
        KeyType: "RANGE",
      });
    }

    if (schema.gsi) {
      for (const gsi of schema.gsi) {
        if (
          !attributeDefinitions.find(
            (a) => a.AttributeName === gsi.partitionKey,
          )
        ) {
          attributeDefinitions.push({
            AttributeName: gsi.partitionKey,
            AttributeType: "S",
          });
        }
        if (
          gsi.sortKey &&
          !attributeDefinitions.find((a) => a.AttributeName === gsi.sortKey)
        ) {
          attributeDefinitions.push({
            AttributeName: gsi.sortKey,
            AttributeType: "S",
          });
        }
      }
    }

    const createTableCommand: any = {
      TableName: schema.tableName,
      KeySchema: keySchema,
      AttributeDefinitions: attributeDefinitions,
      BillingMode: "PAY_PER_REQUEST",
    };

    if (schema.gsi) {
      createTableCommand.GlobalSecondaryIndexes = schema.gsi.map((gsi) => ({
        IndexName: gsi.indexName,
        KeySchema: [
          {
            AttributeName: gsi.partitionKey,
            KeyType: "HASH",
          },
          ...(gsi.sortKey
            ? [
                {
                  AttributeName: gsi.sortKey,
                  KeyType: "RANGE",
                },
              ]
            : []),
        ],
        Projection: {
          ProjectionType: "ALL",
        },
      }));
    }

    await dynamoDbClient.send(new CreateTableCommand(createTableCommand));

    await Promise.race([
      // 500 ms timeout to create the table
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Table creation timeout")), 2000);
      }),

      // poll for table creation every 25ms for 20 attempts (2000ms total)
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
  }

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
