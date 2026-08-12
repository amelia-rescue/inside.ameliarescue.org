import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { EmailEventStore } from "./email-event-store";
import type { User } from "./user-store";
import { log } from "./logger";
import type {
  PhotoAttachment,
  ProblemSection,
  TextNote,
} from "./truck-check/issues";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export class EmailService {
  private readonly client: SESClient;
  private readonly emailEventStore: EmailEventStore;
  private readonly fromEmail: string;

  constructor(fromEmail: string) {
    this.client = new SESClient({});
    this.emailEventStore = EmailEventStore.make();
    this.fromEmail = fromEmail;
  }

  static make(): EmailService {
    const fromEmail =
      process.env.FROM_EMAIL || "noreply@inside.ameliarescue.org";
    return new EmailService(fromEmail);
  }

  async sendTemporaryPasswordEmail(params: {
    user: User;
    temporaryPassword: string;
  }): Promise<void> {
    const { user, temporaryPassword } = params;
    const userName = `${user.first_name} ${user.last_name}`;
    const appUrl = process.env.APP_URL || "https://inside.ameliarescue.org";
    const subject = "Your temporary password for inside.ameliarescue.org";
    const htmlBody = `
      <html>
        <body>
          <h2>Temporary Password</h2>
          <p>Hi ${userName},</p>
          <p>An administrator reset your inside.ameliarescue.org password.</p>
          <p><strong>Username:</strong> ${user.email}</p>
          <p><strong>Temporary password:</strong> ${temporaryPassword}</p>
          <p>Please <a href="${appUrl}/auth/login?login_hint=${encodeURIComponent(user.email)}">sign in here</a> and change your password when prompted. This temporary password will expire in 30 days.</p>
          <p>Thank you,<br/>https://inside.ameliarescue.org</p>
        </body>
      </html>
    `;
    const textBody = `
Hi ${userName},

An administrator reset your inside.ameliarescue.org password.

Username: ${user.email}
Temporary password: ${temporaryPassword}

Please sign in here and change your password when prompted: ${appUrl}/auth/login?login_hint=${encodeURIComponent(user.email)}
This temporary password will expire in 30 days.

Thank you,
https://inside.ameliarescue.org
    `;

    await this.sendEmail({
      toEmail: user.email,
      subject,
      htmlBody,
      textBody,
    });
  }

  async sendCertificationExpiredEmail(params: {
    user: User;
    certificationName: string;
    expirationDate: string;
    isRequired?: boolean;
  }): Promise<void> {
    const { user, certificationName, expirationDate, isRequired } = params;
    const userName = `${user.first_name} ${user.last_name}`;
    const roles = user.membership_roles.map((r) => r.role_name).join(", ");
    const subject = "Certification Expired - Action Required";
    const actionLine = isRequired
      ? `Please upload this certification to maintain your status as ${roles}.`
      : "Please upload a renewed certification at your earliest convenience.";
    const htmlBody = `
      <html>
        <body>
          <h2>Certification Expired</h2>
          <p>Hi ${userName},</p>
          <p>Your <strong>${certificationName}</strong> certification expired on <strong>${expirationDate}</strong>.</p>
          <p>${actionLine}</p>
          <p>Thank you,<br/>https://inside.ameliarescue.org</p>
        </body>
      </html>
    `;
    const textBody = `
Hi ${userName},

Your ${certificationName} certification expired on ${expirationDate}.

${actionLine}

Thank you,
https://inside.ameliarescue.org
    `;

    await this.sendEmail({ toEmail: user.email, subject, htmlBody, textBody });
  }

  async sendCertificationExpiringSoonEmail(params: {
    user: User;
    certificationName: string;
    expirationDate: string;
    isRequired?: boolean;
  }): Promise<void> {
    const { user, certificationName, expirationDate, isRequired } = params;
    const userName = `${user.first_name} ${user.last_name}`;
    const roles = user.membership_roles.map((r) => r.role_name).join(", ");
    const subject = "Certification Expiring Soon - Reminder";
    const actionLine = isRequired
      ? `Please upload this certification to maintain your status as ${roles}.`
      : "Please upload a renewed certification at your earliest convenience.";
    const htmlBody = `
      <html>
        <body>
          <h2>Certification Expiring Soon</h2>
          <p>Hi ${userName},</p>
          <p>Your <strong>${certificationName}</strong> certification will expire on <strong>${expirationDate}</strong>.</p>
          <p>${actionLine}</p>
          <p>Thank you,<br/>https://inside.ameliarescue.org</p>
        </body>
      </html>
    `;
    const textBody = `
Hi ${userName},

Your ${certificationName} certification will expire on ${expirationDate}.

${actionLine}

Thank you,
https://inside.ameliarescue.org
    `;

    await this.sendEmail({ toEmail: user.email, subject, htmlBody, textBody });
  }

  async sendMissingCertificationEmail(params: {
    user: User;
    certificationName: string;
  }): Promise<void> {
    const { user, certificationName } = params;
    const userName = `${user.first_name} ${user.last_name}`;
    const roles = user.membership_roles.map((r) => r.role_name).join(", ");
    const subject = "Missing Required Certification";
    const htmlBody = `
      <html>
        <body>
          <h2>Missing Required Certification</h2>
          <p>Hi ${userName},</p>
          <p>You are missing a required <strong>${certificationName}</strong> certification.</p>
          <p>Please upload this certification to maintain your status as ${roles}.</p>
          <p>Thank you,<br/>https://inside.ameliarescue.org</p>
        </body>
      </html>
    `;
    const textBody = `
Hi ${userName},

You are missing a required ${certificationName} certification.

Please upload this certification to maintain your status as ${roles}.

Thank you,
https://inside.ameliarescue.org
    `;

    await this.sendEmail({ toEmail: user.email, subject, htmlBody, textBody });
  }

  async sendTruckCheckIssuesEmail(params: {
    toEmail: string;
    truckName: string;
    checkId: string;
    checkedAt: string;
    problemSections: ProblemSection[];
    textNotes: TextNote[];
    photos?: PhotoAttachment[];
  }): Promise<void> {
    const {
      toEmail,
      truckName,
      checkId,
      checkedAt,
      problemSections,
      textNotes,
      photos = [],
    } = params;
    const appUrl = process.env.APP_URL || "https://inside.ameliarescue.org";
    const checkUrl = `${appUrl}/truck-checks/${checkId}`;
    const problemCount = problemSections.reduce(
      (sum, section) => sum + section.fields.length,
      0,
    );
    const subject = `Truck check issues - ${truckName}`;

    const problemsHtml =
      problemCount > 0
        ? `<h3>Missing or not present (${problemCount})</h3>` +
          problemSections
            .map(
              (section) =>
                `<p><strong>${escapeHtml(section.sectionTitle)}</strong></p><ul>${section.fields
                  .map((field) => `<li>${escapeHtml(field.label)}</li>`)
                  .join("")}</ul>`,
            )
            .join("")
        : "";
    const notesHtml =
      textNotes.length > 0
        ? `<h3>Notes (${textNotes.length})</h3><ul>${textNotes
            .map(
              (note) =>
                `<li><strong>${escapeHtml(note.sectionTitle)} - ${escapeHtml(note.label)}:</strong> ${escapeHtml(note.value)}</li>`,
            )
            .join("")}</ul>`
        : "";

    const photoCount = photos.reduce(
      (sum, photo) => sum + photo.urls.length,
      0,
    );
    const photosHtml =
      photoCount > 0
        ? `<h3>Photos (${photoCount})</h3>` +
          photos
            .map(
              (photo) =>
                `<p><strong>${escapeHtml(photo.sectionTitle)} - ${escapeHtml(photo.label)}</strong></p><p>${photo.urls
                  .map(
                    (url) =>
                      `<a href="${escapeHtml(url)}"><img src="${escapeHtml(url)}" alt="${escapeHtml(photo.label)}" width="320" style="max-width:320px;height:auto;margin:0 8px 8px 0;border:1px solid #ccc;" /></a>`,
                  )
                  .join("")}</p>`,
            )
            .join("")
        : "";

    const htmlBody = `
      <html>
        <body>
          <h2>Truck Check Issues - ${escapeHtml(truckName)}</h2>
          <p>A truck check for <strong>${escapeHtml(truckName)}</strong> started on ${escapeHtml(checkedAt)} has been locked and reported issues.</p>
          ${problemsHtml}
          ${notesHtml}
          ${photosHtml}
          <p><a href="${checkUrl}">View the full truck check</a></p>
          <p>Thank you,<br/>https://inside.ameliarescue.org</p>
        </body>
      </html>
    `;

    const problemsText =
      problemCount > 0
        ? `Missing or not present (${problemCount}):\n` +
          problemSections
            .map(
              (section) =>
                `${section.sectionTitle}\n` +
                section.fields.map((field) => `  - ${field.label}`).join("\n"),
            )
            .join("\n") +
          "\n\n"
        : "";
    const notesText =
      textNotes.length > 0
        ? `Notes (${textNotes.length}):\n` +
          textNotes
            .map(
              (note) =>
                `  - ${note.sectionTitle} - ${note.label}: ${note.value}`,
            )
            .join("\n") +
          "\n\n"
        : "";

    const photosText =
      photoCount > 0
        ? `Photos (${photoCount}):\n` +
          photos
            .map(
              (photo) =>
                `${photo.sectionTitle} - ${photo.label}\n` +
                photo.urls.map((url) => `  - ${url}`).join("\n"),
            )
            .join("\n") +
          "\n\n"
        : "";

    const textBody = `A truck check for ${truckName} started on ${checkedAt} has been locked and reported issues.

${problemsText}${notesText}${photosText}View the full truck check: ${checkUrl}

Thank you,
https://inside.ameliarescue.org
`;

    await this.sendEmail({ toEmail, subject, htmlBody, textBody });
  }

  private async sendEmail(params: {
    toEmail: string;
    subject: string;
    htmlBody: string;
    textBody: string;
  }): Promise<void> {
    const { toEmail, subject, htmlBody, textBody } = params;
    const command = new SendEmailCommand({
      Source: this.fromEmail,
      Destination: {
        ToAddresses: [toEmail],
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: htmlBody,
            Charset: "UTF-8",
          },
          Text: {
            Data: textBody,
            Charset: "UTF-8",
          },
        },
      },
    });

    try {
      const response = await this.client.send(command);
      if (response.MessageId) {
        await this.emailEventStore.createSentEmailEvent({
          messageId: response.MessageId,
          toEmails: [toEmail],
          subject,
          sourceEmail: this.fromEmail,
          sentAt: new Date().toISOString(),
          origin: "app",
          status: "SEND",
        });
      }
      log.info("Email sent successfully", {
        to_email: toEmail,
        ses_message_id: response.MessageId,
      });
    } catch (error) {
      log.error("Failed to send email", { to_email: toEmail, error });
      throw error;
    }
  }
}
