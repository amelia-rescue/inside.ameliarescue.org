import dayjs from "dayjs";
import { CertificationSnapshotStore } from "./certification-snapshot-store";
import { loadTrainingStatusData } from "./training-status-export";
import {
  buildTrainingStatusDashboardData,
  type TrainingStatusDashboardData,
} from "./training-status-dashboard";

export async function loadTrainingStatusDashboardData(): Promise<TrainingStatusDashboardData> {
  const currentData = await loadTrainingStatusData();
  const snapshotStore = CertificationSnapshotStore.make();
  const now = new Date();
  const startDate = dayjs(now)
    .subtract(11, "month")
    .startOf("month")
    .format("YYYY-MM-DD");
  const endDate = dayjs(now).format("YYYY-MM-DD");
  const snapshots = await snapshotStore.getSnapshotsByDateRange(startDate, endDate);

  return buildTrainingStatusDashboardData({
    currentData,
    snapshots,
    now,
  });
}
