import {
  loadTrainingStatusData,
  serializeTrainingStatusExportRowsToCsv,
} from "../app/lib/certifications/training-status-export";
import { S3Helper } from "../app/lib/s3-helper";

function buildSnapshotKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");

  return `files/reports/training-status/${year}/${month}/training-status-${year}-${month}.csv`;
}

export const handler = async () => {
  console.log("Starting training status CSV snapshot generation");

  try {
    const { exportRows, generatedAt } = await loadTrainingStatusData();
    const csv = serializeTrainingStatusExportRowsToCsv(exportRows);
    const snapshotDate = new Date(generatedAt);
    const key = buildSnapshotKey(snapshotDate);
    const s3Helper = S3Helper.make();

    await s3Helper.putObject(key, csv, "text/csv; charset=utf-8");

    console.log(`Successfully generated training status CSV snapshot: ${key}`);
    console.log(`Export rows: ${exportRows.length}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Training status CSV snapshot generated successfully",
        key,
        generated_at: generatedAt,
        row_count: exportRows.length,
      }),
    };
  } catch (error) {
    console.error("Error generating training status CSV snapshot:", error);
    throw error;
  }
};
