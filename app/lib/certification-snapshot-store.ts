import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  GetCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { DYNALITE_ENDPOINT } from "./dynalite-endpont";

export interface CertificationSnapshot {
  snapshot_date: string; // YYYY-MM-DD
  created_at: string; // ISO timestamp

  // Organization totals
  total_users: number;
  overall_compliance_rate: number;

  // By role
  compliance_by_role: {
    role_name: string;
    user_count: number;
    compliant_count: number;
    compliance_rate: number;
  }[];

  // By track
  compliance_by_track: {
    track_name: string;
    user_count: number;
    compliant_count: number;
    compliance_rate: number;
  }[];

  // By certification type
  cert_type_stats: {
    cert_name: string;
    total_count: number;
    expired_count: number;
    expiring_soon_count: number;
    missing_count: number;
    avg_days_to_expiration: number | null;
  }[];

  // Reminder stats (since last snapshot)
  reminder_stats: {
    expired_sent: number;
    expiring_sent: number;
    missing_sent: number;
  };
}

export class CertificationSnapshotStore {
  private static client: DynamoDBDocumentClient;
  private readonly tableName = "aes_certification_snapshots";

  private constructor() {}

  public static make() {
    if (!CertificationSnapshotStore.client) {
      const dynamoDbClient = new DynamoDBClient(
        import.meta.env?.MODE === "test"
          ? {
              endpoint: DYNALITE_ENDPOINT,
              region: "local",
              credentials: {
                accessKeyId: "local",
                secretAccessKey: "local",
              },
            }
          : {},
      );
      CertificationSnapshotStore.client =
        DynamoDBDocumentClient.from(dynamoDbClient);
    }
    return new CertificationSnapshotStore();
  }

  public async saveSnapshot(
    snapshot: CertificationSnapshot,
  ): Promise<CertificationSnapshot> {
    const command = new PutCommand({
      TableName: this.tableName,
      Item: snapshot,
    });

    await CertificationSnapshotStore.client.send(command);
    return snapshot;
  }

  public async getSnapshot(
    snapshot_date: string,
  ): Promise<CertificationSnapshot | null> {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: {
        snapshot_date,
      },
    });

    const result = await CertificationSnapshotStore.client.send(command);
    return result.Item ? (result.Item as CertificationSnapshot) : null;
  }

  public async getSnapshotsByDateRange(
    startDate: string,
    endDate: string,
  ): Promise<CertificationSnapshot[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "snapshot_date BETWEEN :start AND :end",
      ExpressionAttributeValues: {
        ":start": startDate,
        ":end": endDate,
      },
    });

    const result = await CertificationSnapshotStore.client.send(command);
    return (result.Items || []) as CertificationSnapshot[];
  }

  public async getLatestSnapshot(): Promise<CertificationSnapshot | null> {
    const command = new ScanCommand({
      TableName: this.tableName,
    });

    const result = await CertificationSnapshotStore.client.send(command);

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    // Sort by snapshot_date descending and return the most recent
    const snapshots = result.Items as CertificationSnapshot[];
    snapshots.sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));

    return snapshots[0];
  }
}
