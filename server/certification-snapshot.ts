import { CertificationSnapshotGenerator } from "../app/lib/certifications/certification-snapshot";
import { log } from "~/lib/logger";

export const handler = async () => {
  log.info("Starting certification snapshot generation");

  try {
    const generator = new CertificationSnapshotGenerator();
    const snapshot = await generator.generateAndSaveSnapshot();

    log.info("Successfully generated certification snapshot", {
      snapshot_date: snapshot.snapshot_date,
      total_users: snapshot.total_users,
      overall_compliance_rate: snapshot.overall_compliance_rate,
    });

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
    log.error("Error generating certification snapshot", { error });
    throw error;
  }
};
