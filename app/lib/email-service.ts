import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import type { User } from "./user-store";
import { log } from "./logger";

export class EmailService {
  private readonly client: SESClient;
  private readonly fromEmail: string;

  constructor(fromEmail: string) {
    this.client = new SESClient({});
    this.fromEmail = fromEmail;
  }

  static make(): EmailService {
    const fromEmail =
      process.env.FROM_EMAIL || "noreply@inside.ameliarescue.org";
    return new EmailService(fromEmail);
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
      await this.client.send(command);
      log.info("Email sent successfully", { to_email: toEmail });
    } catch (error) {
      log.error("Failed to send email", { to_email: toEmail, error });
      throw error;
    }
  }
}
