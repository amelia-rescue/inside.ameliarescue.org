import type { ScheduledHandler } from "aws-lambda";

export const handler: ScheduledHandler = async (event) => {
  console.log("Hourly task triggered at:", new Date().toISOString());
  console.log("Event:", JSON.stringify(event, null, 2));

  try {
    // Add your hourly task logic here
    // For example:
    // - Clean up expired sessions
    // - Send reminder emails
    // - Update aggregated statistics
    // - Check for expiring certifications

    console.log("Hourly task completed successfully");
  } catch (error) {
    console.error("Error in hourly task:", error);
    throw error;
  }
};
