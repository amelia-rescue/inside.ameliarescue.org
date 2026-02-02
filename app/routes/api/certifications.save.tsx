import { data } from "react-router";
import type { Route } from "./+types/certifications.save";
import { CertificationStore } from "~/lib/certifications/certification-store";
import { CertificationTypeStore } from "~/lib/certifications/certification-type-store";
import dayjs from "dayjs";

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const certificationId = formData.get("certification_id") as string;
  const userId = formData.get("user_id") as string;
  const certificationTypeName = formData.get(
    "certification_type_name",
  ) as string;
  const fileUrl = formData.get("file_url") as string;
  const expires_on = formData.get("expires_on") as string | undefined;
  const issued_on = formData.get("issued_on") as string | undefined;

  if (!certificationId || !userId || !certificationTypeName || !fileUrl) {
    return data({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const typeStore = CertificationTypeStore.make();
    const certificationType = await typeStore.getCertificationType(
      certificationTypeName,
    );

    if (certificationType.expires) {
      if (!expires_on || !issued_on) {
        return data(
          {
            error: `Certification type "${certificationTypeName}" requires an issued date and expiration date`,
          },
          { status: 400 },
        );
      }
      const now = dayjs();
      if (dayjs(issued_on).isAfter(now)) {
        return data(
          {
            error: `The issued date for ${certificationTypeName} cannot be in the future`,
          },
          { status: 400 },
        );
      }
    }

    const store = CertificationStore.make();

    // Soft-delete any previous certifications of this type for this user
    await store.softDeletePreviousCertifications(userId, certificationTypeName);

    // Create the new certification
    const certification = await store.createCertification({
      certification_id: certificationId,
      user_id: userId,
      certification_type_name: certificationTypeName,
      file_url: fileUrl,
      uploaded_at: new Date().toISOString(),
      expires_on,
      issued_on,
    });

    return data({ success: true, certification });
  } catch (error) {
    console.error("Error saving certification:", error);
    return data({ error: "Failed to save certification" }, { status: 500 });
  }
}
