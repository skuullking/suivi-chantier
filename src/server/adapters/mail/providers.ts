import { randomUUID } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { logger } from "@/server/logger";
import type { MailMessage, MailProvider } from "./types";

/** Development mailbox: messages are stored in the database and shown on /dev/mails. */
export class DevMailProvider implements MailProvider {
  readonly name = "dev";

  async send(message: MailMessage) {
    const to = Array.isArray(message.to) ? message.to.join(", ") : message.to;
    const log = await db.messageLog.create({
      data: {
        organizationId: message.organizationId ?? null,
        channel: "EMAIL",
        direction: "OUTBOUND",
        provider: "dev-mail",
        toAddress: to.toLowerCase(),
        subject: message.subject,
        body: message.text,
        payload: {
          html: message.html ?? null,
          attachments: (message.attachments ?? []).map((a) => ({
            filename: a.filename,
            size: a.content.length,
          })),
        },
        status: "delivered",
      },
    });
    logger.info(
      { to, subject: message.subject },
      "E-mail enregistré dans la boîte de développement (/dev/mails)",
    );
    return { id: log.id };
  }
}

export class ConsoleMailProvider implements MailProvider {
  readonly name = "console";

  async send(message: MailMessage) {
    logger.info({ to: message.to, subject: message.subject, text: message.text }, "E-mail (console)");
    return { id: randomUUID() };
  }
}

export class SmtpMailProvider implements MailProvider {
  readonly name = "smtp";
  private transporter: Transporter;

  constructor() {
    const e = env();
    this.transporter = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD ?? "" } : undefined,
    });
  }

  async send(message: MailMessage) {
    const info = await this.transporter.sendMail({
      from: env().MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      replyTo: message.replyTo,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    return { id: String(info.messageId) };
  }
}
