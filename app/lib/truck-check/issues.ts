import type { TruckCheckSchema } from "./truck-check-schema-store";

export type ProblemField = {
  fieldId: string;
  label: string;
};

export type ProblemSection = {
  sectionTitle: string;
  fields: ProblemField[];
};

export type TextNote = {
  fieldId: string;
  sectionTitle: string;
  label: string;
  value: string;
};

export type PhotoAttachment = {
  fieldId: string;
  sectionTitle: string;
  label: string;
  urls: string[];
};

export type TruckCheckIssues = {
  problemSections: ProblemSection[];
  textNotes: TextNote[];
  photos: PhotoAttachment[];
  problemCount: number;
};

export function getPhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (photoUrl): photoUrl is string =>
      typeof photoUrl === "string" && photoUrl.trim().length > 0,
  );
}

export function getFieldId(sectionId: string, fieldLabel: string): string {
  return `${sectionId}-${fieldLabel.replace(/\s+/g, "-").toLowerCase()}`;
}

export function extractIssues({
  data,
  schema,
}: {
  data: Record<string, unknown>;
  schema: TruckCheckSchema;
}): TruckCheckIssues {
  const problemSections: ProblemSection[] = [];
  const textNotes: TextNote[] = [];
  const photos: PhotoAttachment[] = [];

  for (const section of schema.sections) {
    const problemFields: ProblemField[] = [];
    for (const field of section.fields) {
      const fieldId = getFieldId(section.id, field.label);

      if (field.type === "checkbox" && data[fieldId] === "not-present") {
        problemFields.push({ fieldId, label: field.label });
        continue;
      }

      if (field.type === "text") {
        const value = data[fieldId];
        if (typeof value === "string" && value.trim().length > 0) {
          textNotes.push({
            fieldId,
            sectionTitle: section.title,
            label: field.label,
            value: value.trim(),
          });
        }
        continue;
      }

      if (field.type === "photo") {
        const urls = getPhotoUrls(data[fieldId]);
        if (urls.length > 0) {
          photos.push({
            fieldId,
            sectionTitle: section.title,
            label: field.label,
            urls,
          });
        }
      }
    }

    if (problemFields.length > 0) {
      problemSections.push({
        sectionTitle: section.title,
        fields: problemFields,
      });
    }
  }

  const problemCount = problemSections.reduce(
    (sum, section) => sum + section.fields.length,
    0,
  );

  return { problemSections, textNotes, photos, problemCount };
}

/**
 * Photos alone do not count as an issue - they are supporting evidence
 * attached to whatever missing items or notes were reported.
 */
export function hasIssues(issues: TruckCheckIssues): boolean {
  return issues.problemCount > 0 || issues.textNotes.length > 0;
}
