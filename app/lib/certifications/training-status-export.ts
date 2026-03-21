import { CertificationStore, type Certification } from "./certification-store";
import { TrackStore, type Track } from "../track-store";
import { UserStore, type User } from "../user-store";

export type CertStatus = "active" | "expiring_soon" | "expired" | "missing";

export interface TrainingStatusRow {
  user_id: string;
  name: string;
  roles: Array<{ label: string; precepting: boolean }>;
  certifications: Record<string, CertStatus>;
}

export interface TrainingStatusExportRow {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  website_role: User["website_role"];
  membership_roles: string;
  certification_type: string;
  required: boolean;
  status: CertStatus;
  issued_on: string;
  expires_on: string;
  uploaded_at: string;
  file_url: string;
  generated_at: string;
}

export interface TrainingStatusComplianceStats {
  totalRequiredCerts: number;
  totalValidCerts: number;
  compliancePercentage: number;
}

export interface TrainingStatusData {
  trainingData: TrainingStatusRow[];
  certificationTypes: string[];
  complianceStats: TrainingStatusComplianceStats;
  exportRows: TrainingStatusExportRow[];
  generatedAt: string;
}

interface BuildTrainingStatusDataParams {
  users: User[];
  tracks: Track[];
  certificationsByUserId: Record<string, Certification[]>;
  now?: Date;
}

export function calculateCertificationStatus(
  certification: Pick<Certification, "expires_on"> | null | undefined,
  now: Date = new Date(),
): CertStatus {
  if (!certification) {
    return "missing";
  }

  if (!certification.expires_on) {
    return "active";
  }

  const expiresOn = new Date(certification.expires_on);
  const threeMonthsFromNow = new Date(now);
  threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

  if (expiresOn < now) {
    return "expired";
  }

  if (expiresOn < threeMonthsFromNow) {
    return "expiring_soon";
  }

  return "active";
}

export function calculateComplianceStats(trainingData: TrainingStatusRow[]) {
  let totalRequiredCerts = 0;
  let totalValidCerts = 0;

  trainingData.forEach((row) => {
    Object.values(row.certifications).forEach((status) => {
      totalRequiredCerts++;
      if (status === "active" || status === "expiring_soon") {
        totalValidCerts++;
      }
    });
  });

  const compliancePercentage =
    totalRequiredCerts > 0
      ? Math.round((totalValidCerts / totalRequiredCerts) * 100)
      : 0;

  return {
    totalRequiredCerts,
    totalValidCerts,
    compliancePercentage,
  };
}

function formatMembershipRoles(user: User): string {
  return user.membership_roles
    .map(
      (role) =>
        `${role.role_name} - ${role.track_name}${role.precepting ? " (Precepting)" : ""}`,
    )
    .join("; ");
}

function buildRequiredCertificationNames(user: User, tracks: Track[]): string[] {
  const requiredCertNames = new Set<string>();

  for (const assignment of user.membership_roles) {
    const track = tracks.find((candidate) => candidate.name === assignment.track_name);
    if (!track) {
      continue;
    }

    track.required_certifications.forEach((certName) => {
      requiredCertNames.add(certName);
    });
  }

  return Array.from(requiredCertNames).sort();
}

function buildCurrentCertificationsByType(
  certifications: Certification[],
): Map<string, Certification> {
  const certificationsByType = new Map<string, Certification>();

  for (const certification of certifications) {
    const existingCertification = certificationsByType.get(
      certification.certification_type_name,
    );

    if (
      !existingCertification ||
      certification.uploaded_at.localeCompare(existingCertification.uploaded_at) > 0
    ) {
      certificationsByType.set(
        certification.certification_type_name,
        certification,
      );
    }
  }

  return certificationsByType;
}

export function buildTrainingStatusData({
  users,
  tracks,
  certificationsByUserId,
  now = new Date(),
}: BuildTrainingStatusDataParams): TrainingStatusData {
  const generatedAt = now.toISOString();
  const exportRows: TrainingStatusExportRow[] = [];

  const trainingData: TrainingStatusRow[] = users.map((user) => {
    const userCertifications = certificationsByUserId[user.user_id] || [];
    const requiredCertifications = buildRequiredCertificationNames(user, tracks);
    const currentCertificationsByType = buildCurrentCertificationsByType(
      userCertifications,
    );
    const certifications: Record<string, CertStatus> = {};

    requiredCertifications.forEach((certificationTypeName) => {
      certifications[certificationTypeName] = calculateCertificationStatus(
        currentCertificationsByType.get(certificationTypeName),
        now,
      );
    });

    const exportCertificationTypes = Array.from(
      new Set([
        ...requiredCertifications,
        ...Array.from(currentCertificationsByType.keys()),
      ]),
    ).sort();

    exportCertificationTypes.forEach((certificationTypeName) => {
      const certification = currentCertificationsByType.get(certificationTypeName);
      const required = requiredCertifications.includes(certificationTypeName);

      exportRows.push({
        user_id: user.user_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        website_role: user.website_role,
        membership_roles: formatMembershipRoles(user),
        certification_type: certificationTypeName,
        required,
        status: calculateCertificationStatus(certification, now),
        issued_on: certification?.issued_on || "",
        expires_on: certification?.expires_on || "",
        uploaded_at: certification?.uploaded_at || "",
        file_url: certification?.file_url || "",
        generated_at: generatedAt,
      });
    });

    return {
      user_id: user.user_id,
      name: `${user.first_name} ${user.last_name}`,
      roles: user.membership_roles.map((role) => ({
        label: `${role.role_name} - ${role.track_name}`,
        precepting: role.precepting,
      })),
      certifications,
    };
  });

  exportRows.sort((a, b) => {
    const nameCompare = `${a.last_name},${a.first_name}`.localeCompare(
      `${b.last_name},${b.first_name}`,
    );
    if (nameCompare !== 0) {
      return nameCompare;
    }

    return a.certification_type.localeCompare(b.certification_type);
  });

  const allRequiredCerts = new Set<string>();
  trainingData.forEach((row) => {
    Object.keys(row.certifications).forEach((certificationType) => {
      allRequiredCerts.add(certificationType);
    });
  });

  return {
    trainingData,
    certificationTypes: Array.from(allRequiredCerts).sort(),
    complianceStats: calculateComplianceStats(trainingData),
    exportRows,
    generatedAt,
  };
}

export async function loadTrainingStatusData(): Promise<TrainingStatusData> {
  const userStore = UserStore.make();
  const trackStore = TrackStore.make();
  const certificationStore = CertificationStore.make();

  const [users, tracks] = await Promise.all([
    userStore.listUsers(),
    trackStore.listTracks(),
  ]);

  const certificationsByUserEntries = await Promise.all(
    users.map(async (user) => {
      const certifications = await certificationStore.listCertificationsByUser(
        user.user_id,
      );

      return [user.user_id, certifications] as const;
    }),
  );

  const certificationsByUserId = Object.fromEntries(certificationsByUserEntries);

  return buildTrainingStatusData({
    users,
    tracks,
    certificationsByUserId,
  });
}

const trainingStatusCsvColumns: Array<keyof TrainingStatusExportRow> = [
  "user_id",
  "first_name",
  "last_name",
  "email",
  "website_role",
  "membership_roles",
  "certification_type",
  "required",
  "status",
  "issued_on",
  "expires_on",
  "uploaded_at",
  "file_url",
  "generated_at",
];

function escapeCsvValue(value: string): string {
  if (/[,"\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

export function serializeTrainingStatusExportRowsToCsv(
  rows: TrainingStatusExportRow[],
): string {
  const headerRow = trainingStatusCsvColumns.join(",");
  const dataRows = rows.map((row) =>
    trainingStatusCsvColumns
      .map((column) => {
        const value = row[column];
        const normalizedValue =
          typeof value === "boolean" ? (value ? "yes" : "no") : String(value ?? "");
        return escapeCsvValue(normalizedValue);
      })
      .join(","),
  );

  return [headerRow, ...dataRows].join("\n");
}
