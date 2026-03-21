import type { LoaderFunctionArgs } from "react-router";
import { appContext } from "~/context";
import {
  loadTrainingStatusData,
  serializeTrainingStatusExportRowsToCsv,
} from "~/lib/certifications/training-status-export";

export async function loader({ context }: LoaderFunctionArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("No user found");
  }

  const { exportRows, generatedAt } = await loadTrainingStatusData();
  const csv = serializeTrainingStatusExportRowsToCsv(exportRows);
  const timestamp = generatedAt.replaceAll(":", "-");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="training-status-${timestamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
