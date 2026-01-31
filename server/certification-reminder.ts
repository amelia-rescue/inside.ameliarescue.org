import type { ScheduledHandler } from "aws-lambda";
import { CertificationReminder } from "../app/lib/certification-reminder.js";

export const handler: ScheduledHandler = async (event) => {
  console.log(
    "Certification reminder task triggered at:",
    new Date().toISOString(),
  );
  console.log("Event:", JSON.stringify(event, null, 2));

  try {
    const certificationReminder = new CertificationReminder();
    await certificationReminder.checkAllUserCertifications();

    console.log("Certification reminder task completed successfully");
  } catch (error) {
    console.error("Error in certification reminder task:", error);
    throw error;
  }
};
