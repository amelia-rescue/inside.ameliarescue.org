import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

/**
 * Migration script to rename "Driver" track to "Evoc"
 *
 * This script:
 * 1. Fetches the "Driver" track
 * 2. Creates a new "Evoc" track with the same data
 * 3. Updates all users with "Driver" track_name to "Evoc"
 * 4. Deletes the old "Driver" track
 */

async function renameDriverTrack() {
  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);

  const TRACKS_TABLE = process.env.TRACKS_TABLE_NAME || "aes_tracks";
  const USERS_TABLE = process.env.USERS_TABLE_NAME || "aes_users";

  console.log("Starting migration: Rename 'Driver' track to 'Evoc'");
  console.log(`Tracks table: ${TRACKS_TABLE}`);
  console.log(`Users table: ${USERS_TABLE}`);

  try {
    // Step 1: Get the "Driver" track
    console.log("\n1. Fetching 'Driver' track...");
    const driverTrackResult = await docClient.send(
      new GetCommand({
        TableName: TRACKS_TABLE,
        Key: { name: "Driver" },
      }),
    );

    if (!driverTrackResult.Item) {
      console.log("❌ 'Driver' track not found. Nothing to migrate.");
      return;
    }

    const driverTrack = driverTrackResult.Item;
    console.log("✓ Found 'Driver' track:", driverTrack);

    // Step 2: Check if "Evoc" track already exists
    console.log("\n2. Checking if 'Evoc' track already exists...");
    const evocTrackResult = await docClient.send(
      new GetCommand({
        TableName: TRACKS_TABLE,
        Key: { name: "Evoc" },
      }),
    );

    if (evocTrackResult.Item) {
      console.log("❌ 'Evoc' track already exists. Aborting migration.");
      console.log("   Please manually resolve this conflict.");
      return;
    }

    // Step 3: Create new "Evoc" track
    console.log("\n3. Creating 'Evoc' track...");
    const now = new Date().toISOString();
    const evocTrack = {
      name: "Evoc",
      description: driverTrack.description,
      required_certifications: driverTrack.required_certifications,
      created_at: now,
      updated_at: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: TRACKS_TABLE,
        Item: evocTrack,
      }),
    );
    console.log("✓ Created 'Evoc' track");

    // Step 4: Get all users
    console.log("\n4. Fetching all users...");
    const usersResult = await docClient.send(
      new ScanCommand({
        TableName: USERS_TABLE,
      }),
    );

    const users = usersResult.Items || [];
    console.log(`✓ Found ${users.length} users`);

    // Step 5: Update users with "Driver" track
    console.log("\n5. Updating users with 'Driver' track to 'Evoc'...");
    let updatedCount = 0;

    for (const user of users) {
      const membershipRoles = user.membership_roles || [];
      const hasDriverTrack = membershipRoles.some(
        (role: any) => role.track_name === "Driver",
      );

      if (hasDriverTrack) {
        const updatedRoles = membershipRoles.map((role: any) => ({
          ...role,
          track_name: role.track_name === "Driver" ? "Evoc" : role.track_name,
        }));

        await docClient.send(
          new PutCommand({
            TableName: USERS_TABLE,
            Item: {
              ...user,
              membership_roles: updatedRoles,
              updated_at: now,
            },
          }),
        );

        console.log(`  ✓ Updated user: ${user.first_name} ${user.last_name}`);
        updatedCount++;
      }
    }

    console.log(`✓ Updated ${updatedCount} user(s)`);

    // Step 6: Delete old "Driver" track
    console.log("\n6. Deleting old 'Driver' track...");
    await docClient.send(
      new DeleteCommand({
        TableName: TRACKS_TABLE,
        Key: { name: "Driver" },
      }),
    );
    console.log("✓ Deleted 'Driver' track");

    console.log("\n✅ Migration completed successfully!");
    console.log(`   - Created 'Evoc' track`);
    console.log(`   - Updated ${updatedCount} user(s)`);
    console.log(`   - Deleted 'Driver' track`);
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    throw error;
  }
}

// Run the migration
renameDriverTrack()
  .then(() => {
    console.log("\nMigration script finished.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nMigration script failed:", error);
    process.exit(1);
  });
