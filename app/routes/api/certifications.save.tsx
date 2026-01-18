import { data } from "react-router";
import type { Route } from "./+types/certifications.save";
import { CertificationStore } from "~/lib/certification-store";
import { CertificationTypeStore } from "~/lib/certification-type-store";

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const certificationId = formData.get("certification_id") as string;
  const userId = formData.get("user_id") as string;
  const certificationTypeName = formData.get(
    "certification_type_name",
  ) as string;
  const fileUrl = formData.get("file_url") as string;
  const expiresOn = formData.get("expires_on") as string | null;

  if (!certificationId || !userId || !certificationTypeName || !fileUrl) {
    return data({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const typeStore = CertificationTypeStore.make();
    const certificationType = await typeStore.getCertificationType(
      certificationTypeName,
    );

    if (certificationType.expires && !expiresOn) {
      return data(
        {
          error: `Certification type "${certificationTypeName}" requires an expiration date`,
        },
        { status: 400 },
      );
    }

    const store = CertificationStore.make();
    const certification = await store.createCertification({
      certification_id: certificationId,
      user_id: userId,
      certification_type_name: certificationTypeName,
      file_url: fileUrl,
      uploaded_at: new Date().toISOString(),
      ...(expiresOn ? { expires_on: expiresOn } : {}),
    });

    return data({ success: true, certification });
  } catch (error) {
    console.error("Error saving certification:", error);
    return data({ error: "Failed to save certification" }, { status: 500 });
  }
}
