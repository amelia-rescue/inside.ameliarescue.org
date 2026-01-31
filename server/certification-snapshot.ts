import { CertificationSnapshotGenerator } from "../app/lib/certification-snapshot";

export const handler = async () => {
  console.log("Starting certification snapshot generation");

  try {
    const generator = new CertificationSnapshotGenerator();
    const snapshot = await generator.generateAndSaveSnapshot();

    console.log(
      `Successfully generated snapshot for ${snapshot.snapshot_date}`,
    );
    console.log(`Total users: ${snapshot.total_users}`);
    console.log(
      `Overall compliance rate: ${(snapshot.overall_compliance_rate * 100).toFixed(1)}%`,
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Snapshot generated successfully",
        snapshot_date: snapshot.snapshot_date,
        total_users: snapshot.total_users,
        overall_compliance_rate: snapshot.overall_compliance_rate,
      }),
    };
  } catch (error) {
    console.error("Error generating snapshot:", error);
    throw error;
  }
};
