import type { SNSHandler } from "aws-lambda";
import { EmailEventStore } from "../app/lib/email-event-store.js";
import { log } from "../app/lib/logger.js";

type SesNotificationPayload = {
  eventType?: string;
  mail?: {
    messageId?: string;
    timestamp?: string;
    source?: string;
    sourceArn?: string;
    sendingAccountId?: string;
    destination?: string[];
    commonHeaders?: {
      subject?: string;
      from?: string[];
      to?: string[];
    };
    tags?: Record<string, string[]>;
  };
  bounce?: {
    bounceType?: string;
    bounceSubType?: string;
    bouncedRecipients?: Array<{
      emailAddress?: string;
      action?: string;
      status?: string;
      diagnosticCode?: string;
    }>;
    timestamp?: string;
    reportingMTA?: string;
  };
  complaint?: {
    complainedRecipients?: Array<{
      emailAddress?: string;
    }>;
    timestamp?: string;
    complaintFeedbackType?: string;
    userAgent?: string;
    complaintSubType?: string;
  };
  delivery?: {
    timestamp?: string;
    processingTimeMillis?: number;
    recipients?: string[];
    smtpResponse?: string;
    reportingMTA?: string;
  };
  deliveryDelay?: {
    timestamp?: string;
    delayType?: string;
    delayedRecipients?: Array<{
      emailAddress?: string;
      diagnosticCode?: string;
      status?: string;
    }>;
    expirationTime?: string;
  };
  failure?: {
    errorMessage?: string;
    templateName?: string;
  };
  reject?: {
    reason?: string;
  };
};

function parseSesNotification(message: string): SesNotificationPayload {
  return JSON.parse(message) as SesNotificationPayload;
}

function getRecipients(payload: SesNotificationPayload): string[] {
  return (
    payload.delivery?.recipients ??
    payload.mail?.destination ??
    payload.bounce?.bouncedRecipients
      ?.map((recipient) => recipient.emailAddress)
      .filter((email): email is string => Boolean(email)) ??
    payload.complaint?.complainedRecipients
      ?.map((recipient) => recipient.emailAddress)
      .filter((email): email is string => Boolean(email)) ??
    payload.deliveryDelay?.delayedRecipients
      ?.map((recipient) => recipient.emailAddress)
      .filter((email): email is string => Boolean(email)) ??
    []
  );
}

function buildEventDetails(payload: SesNotificationPayload) {
  return {
    ses_event_type: payload.eventType,
    ses_message_id: payload.mail?.messageId,
    ses_mail_timestamp: payload.mail?.timestamp,
    ses_event_timestamp:
      payload.delivery?.timestamp ??
      payload.bounce?.timestamp ??
      payload.complaint?.timestamp ??
      payload.deliveryDelay?.timestamp,
    ses_source: payload.mail?.source,
    ses_source_arn: payload.mail?.sourceArn,
    ses_sending_account_id: payload.mail?.sendingAccountId,
    ses_subject: payload.mail?.commonHeaders?.subject,
    ses_from: payload.mail?.commonHeaders?.from,
    ses_to: payload.mail?.commonHeaders?.to,
    ses_recipients: getRecipients(payload),
    ses_tags: payload.mail?.tags,
    ses_delivery_processing_time_ms: payload.delivery?.processingTimeMillis,
    ses_delivery_smtp_response: payload.delivery?.smtpResponse,
    ses_delivery_reporting_mta: payload.delivery?.reportingMTA,
    ses_bounce_type: payload.bounce?.bounceType,
    ses_bounce_sub_type: payload.bounce?.bounceSubType,
    ses_bounced_recipients: payload.bounce?.bouncedRecipients,
    ses_bounce_reporting_mta: payload.bounce?.reportingMTA,
    ses_complaint_feedback_type: payload.complaint?.complaintFeedbackType,
    ses_complaint_sub_type: payload.complaint?.complaintSubType,
    ses_complaint_user_agent: payload.complaint?.userAgent,
    ses_complained_recipients: payload.complaint?.complainedRecipients,
    ses_delivery_delay_type: payload.deliveryDelay?.delayType,
    ses_delayed_recipients: payload.deliveryDelay?.delayedRecipients,
    ses_delivery_delay_expiration_time: payload.deliveryDelay?.expirationTime,
    ses_reject_reason: payload.reject?.reason,
    ses_failure_error_message: payload.failure?.errorMessage,
    ses_failure_template_name: payload.failure?.templateName,
  };
}

function getLogLevel(eventType?: string): "info" | "warn" | "error" {
  switch (eventType) {
    case "Bounce":
    case "Complaint":
    case "DeliveryDelay":
    case "Reject":
    case "Rendering Failure":
      return "warn";
    default:
      return "info";
  }
}

export const handler: SNSHandler = async (event) => {
  const emailEventStore = EmailEventStore.make();

  for (const record of event.Records) {
    try {
      const payload = parseSesNotification(record.Sns.Message);
      const details = {
        sns_message_id: record.Sns.MessageId,
        sns_topic_arn: record.Sns.TopicArn,
        sns_timestamp: record.Sns.Timestamp,
        ...buildEventDetails(payload),
      };
      const logLevel = getLogLevel(payload.eventType);

      const messageId = payload.mail?.messageId;
      const eventType = payload.eventType ?? "UNKNOWN";
      const eventAt =
        payload.delivery?.timestamp ??
        payload.bounce?.timestamp ??
        payload.complaint?.timestamp ??
        payload.deliveryDelay?.timestamp ??
        payload.mail?.timestamp ??
        record.Sns.Timestamp;

      if (messageId) {
        await emailEventStore.upsertStatusFromSesCallback({
          messageId,
          eventType,
          eventAt,
          snsMessageId: record.Sns.MessageId,
          toEmails: getRecipients(payload),
          subject: payload.mail?.commonHeaders?.subject,
          sourceEmail: payload.mail?.source,
          tags: payload.mail?.tags,
          origin: payload.mail?.source?.includes("cognito")
            ? "cognito"
            : "ses_callback",
          details,
          bounceType: payload.bounce?.bounceType,
          bounceSubType: payload.bounce?.bounceSubType,
          complaintFeedbackType: payload.complaint?.complaintFeedbackType,
          deliveryDelayType: payload.deliveryDelay?.delayType,
        });
      }

      if (logLevel === "warn") {
        log.warn("SES status event received", details);
        continue;
      }

      log.info("SES status event received", details);
    } catch (error) {
      log.error("Failed to process SES status event", {
        sns_message_id: record.Sns.MessageId,
        sns_topic_arn: record.Sns.TopicArn,
        sns_timestamp: record.Sns.Timestamp,
        sns_subject: record.Sns.Subject,
        sns_message: record.Sns.Message,
        error,
      });
      throw error;
    }
  }
};
