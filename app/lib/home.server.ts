import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { calculateCompletion, resolveSchema } from "./truck-check/completion";
import { extractIssues } from "./truck-check/issues";
import {
  TruckCheckSchemaStore,
  type TruckCheckSchema,
} from "./truck-check/truck-check-schema-store";
import {
  TruckCheckStore,
  type DocumentTruckCheck,
} from "./truck-check/truck-check-store";
import {
  loadTrainingStatusData,
  type CertStatus,
} from "./certifications/training-status-export";

dayjs.extend(utc);
dayjs.extend(timezone);

const HISTORY_DAYS = 60;
const ISSUE_DAYS = 14;
const MAX_ISSUES = 6;

const statusOrder: Record<CertStatus, number> = {
  expired: 0,
  missing: 1,
  expiring_soon: 2,
  active: 3,
};

export type HomeCertification = {
  type: string;
  status: CertStatus;
  expiresOn: string;
  daysLeft: number | null;
};

export type HomeIssue = {
  key: string;
  checkId: string;
  truckName: string;
  label: string;
  dayLabel: string;
  reporter: string;
};

function shortName(person: { first_name: string; last_name: string }) {
  return `${person.first_name.charAt(0)}. ${person.last_name}`;
}

export async function loadHomeData({
  userId,
  timeZone,
  now = new Date(),
}: {
  userId: string;
  timeZone: string;
  now?: Date;
}) {
  const schemaStore = TruckCheckSchemaStore.make();
  const checkStore = TruckCheckStore.make();
  const local = (date: string | Date) => dayjs(date).tz(timeZone);
  const today = local(now);

  const [trucks, { truckChecks }, training] = await Promise.all([
    schemaStore.listTrucks(),
    checkStore.listTruckChecksInRange({
      startDate: dayjs(now).subtract(HISTORY_DAYS, "day").toISOString(),
    }),
    loadTrainingStatusData(),
  ]);

  const activeTrucks = trucks
    .filter((truck) => !truck.retired)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const truckName = (truckId: string) =>
    trucks.find((truck) => truck.truckId === truckId)?.displayName ?? truckId;

  // Checks come back newest first.
  const lastCheckedByTruck: Record<string, string> = {};
  const latestCheckByTruck = new Map<string, DocumentTruckCheck>();
  const userCheckCounts = new Map<string, number>();
  for (const check of truckChecks) {
    if (!latestCheckByTruck.has(check.truck)) {
      latestCheckByTruck.set(check.truck, check);
      lastCheckedByTruck[check.truck] = local(check.created_at).format(
        "ddd, MMM D",
      );
    }
    if (check.contributors[userId]) {
      userCheckCounts.set(
        check.truck,
        (userCheckCounts.get(check.truck) ?? 0) + 1,
      );
    }
  }

  // The truck this member checks most often; ties go to the most recent.
  const usualTruckId =
    [...userCheckCounts.entries()]
      .filter(([truckId]) => activeTrucks.some((t) => t.truckId === truckId))
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? activeTrucks[0]?.truckId;

  const schemaCache = new Map<string, TruckCheckSchema>();

  const todayCheckDoc = truckChecks.find((check) =>
    local(check.created_at).isSame(today, "day"),
  );
  const previousCheck = truckChecks.find(
    (check) => !local(check.created_at).isSame(today, "day"),
  );
  let todayCheck = null;
  if (todayCheckDoc) {
    const { requiredCompleted, requiredTotal } = await calculateCompletion({
      check: todayCheckDoc,
      trucks,
      schemaStore,
      cache: schemaCache,
    });
    todayCheck = {
      id: todayCheckDoc.id,
      truckName: truckName(todayCheckDoc.truck),
      locked: todayCheckDoc.locked,
      requiredCompleted,
      requiredTotal,
      startedAt: local(todayCheckDoc.created_at).format("HH:mm"),
      isContributor: Boolean(todayCheckDoc.contributors[userId]),
      contributors: Object.entries(todayCheckDoc.contributors)
        .filter(([id]) => id !== userId)
        .map(([, person]) => ({
          name: shortName(person),
          initials: `${person.first_name.charAt(0)}${person.last_name.charAt(0)}`,
        })),
    };
  }

  // Issues on each truck's latest check, so fixed problems drop off once the
  // truck is checked again.
  const issueCutoff = dayjs(now).subtract(ISSUE_DAYS, "day");
  const recentIssues: HomeIssue[] = [];
  for (const check of latestCheckByTruck.values()) {
    if (dayjs(check.created_at).isBefore(issueCutoff)) continue;
    const schema = await resolveSchema(check, trucks, schemaStore, schemaCache);
    if (!schema) continue;
    const { problemSections, textNotes } = extractIssues({
      data: check.data,
      schema,
      fieldNotes: check.field_notes,
      fieldUpdates: check.field_updates,
    });
    const base = {
      checkId: check.id,
      truckName: truckName(check.truck),
      dayLabel: local(check.created_at).format("ddd"),
    };
    for (const section of problemSections) {
      for (const field of section.fields) {
        recentIssues.push({
          ...base,
          key: `${check.id}:${field.fieldId}`,
          label: `${field.label} (${section.sectionTitle})${field.note ? `: ${field.note}` : ""}`,
          reporter: field.updatedBy ? shortName(field.updatedBy) : "",
        });
      }
    }
    for (const note of textNotes) {
      recentIssues.push({
        ...base,
        key: `${check.id}:${note.fieldId}`,
        label: `${note.label}: ${note.value}`,
        reporter: note.updatedBy ? shortName(note.updatedBy) : "",
      });
    }
  }

  const myCertifications: HomeCertification[] = training.exportRows
    .filter((row) => row.user_id === userId)
    .map((row) => ({
      type: row.certification_type,
      status: row.status,
      expiresOn: row.expires_on
        ? dayjs(row.expires_on).format("MMM D, YYYY")
        : "",
      daysLeft: row.expires_on
        ? dayjs(row.expires_on).diff(dayjs(now), "day")
        : null,
    }))
    .sort(
      (a, b) =>
        statusOrder[a.status] - statusOrder[b.status] ||
        (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity),
    );

  const squadCounts = { active: 0, expiring_soon: 0, expired: 0, missing: 0 };
  for (const row of training.exportRows) {
    if (row.required) squadCounts[row.status] += 1;
  }

  const hour = today.hour();
  return {
    greeting: hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening",
    dateLabel: today.format("dddd · MMM D"),
    trucks: activeTrucks.map((truck) => ({
      truckId: truck.truckId,
      displayName: truck.displayName,
      lastChecked: lastCheckedByTruck[truck.truckId] ?? null,
    })),
    usualTruckId,
    usualTruckIsHistory: userCheckCounts.size > 0,
    todayCheck,
    previousCheck: previousCheck && {
      truckName: truckName(previousCheck.truck),
      dayLabel: local(previousCheck.created_at).format("ddd HH:mm"),
      by: Object.values(previousCheck.contributors).map(shortName).join(", "),
    },
    recentIssues: recentIssues.slice(0, MAX_ISSUES),
    recentIssueCount: recentIssues.length,
    myCertifications,
    squad: {
      compliancePercentage: training.complianceStats.compliancePercentage,
      ...squadCounts,
    },
  };
}
