/**
 * Inbound e-mails: each organization has an address `docs-<slug>@INBOUND_MAIL_DOMAIN`. Forwarded e-mails (and
 * their attachments) enter the document pipeline. Raw MIME is posted by the mail provider (or the simulator).
 */
import { type AddressObject, simpleParser } from "mailparser";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { enqueue } from "@/server/jobs/queue";
import { logger } from "@/server/logger";
import { storeDocument } from "./documents";

export function inboundAddress(slug: string) {
  return `docs-${slug}@${env().INBOUND_MAIL_DOMAIN}`;
}

function addresses(field: AddressObject | AddressObject[] | undefined): string[] {
  const list = Array.isArray(field) ? field : field ? [field] : [];
  return list.flatMap((a) => a.value.map((v) => (v.address ?? "").toLowerCase())).filter(Boolean);
}

/** Organization slug from the recipients (To, Cc, Delivered-To). */
export function slugFromRecipients(recipients: string[], domain = env().INBOUND_MAIL_DOMAIN): string | null {
  for (const r of recipients) {
    const m = /^docs-([a-z0-9-]+)@(.+)$/.exec(r.trim().toLowerCase());
    if (m && m[2] === domain.toLowerCase()) return m[1]!;
  }
  return null;
}

export type InboundResult =
  | { status: "processed"; organizationId: string; documents: number }
  | { status: "duplicate" }
  | { status: "unknown_recipient" };

export async function receiveInboundMail(raw: Buffer): Promise<InboundResult> {
  const mail = await simpleParser(raw, { skipHtmlToText: false });
  const recipients = [
    ...addresses(mail.to),
    ...addresses(mail.cc),
    ...[mail.headers.get("delivered-to"), mail.headers.get("x-original-to")].flatMap((h) =>
      typeof h === "string" ? [h.toLowerCase()] : [],
    ),
  ];
  const slug = slugFromRecipients(recipients);
  const org = slug ? await db.organization.findUnique({ where: { slug } }) : null;
  if (!org) {
    logger.warn({ recipients }, "E-mail entrant pour une adresse inconnue");
    return { status: "unknown_recipient" };
  }
  const from = mail.from?.value[0];
  const messageId = mail.messageId ?? `no-id-${Date.now()}-${Math.random()}`;
  try {
    await db.messageLog.create({
      data: {
        organizationId: org.id,
        channel: "EMAIL",
        direction: "INBOUND",
        provider: "inbound-mail",
        externalId: messageId,
        fromAddress: from?.address?.toLowerCase() ?? null,
        toAddress: inboundAddress(org.slug),
        subject: mail.subject ?? null,
        body: (mail.text ?? "").slice(0, 20_000),
        status: "received",
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return { status: "duplicate" };
    throw error;
  }

  const attachments = mail.attachments.filter(
    (a) => a.contentDisposition !== "inline" || a.contentType.startsWith("image/"),
  );
  const files =
    attachments.length > 0
      ? attachments.map((a) => ({ name: a.filename ?? "piece-jointe", bytes: new Uint8Array(a.content) }))
      : mail.text?.trim()
        ? [
            {
              // No attachment: the e-mail itself is kept as a text document.
              name: `${(mail.subject ?? "E-mail").replace(/[^\p{L}\p{N} _-]+/gu, "").slice(0, 60) || "E-mail"}.txt`,
              bytes: new TextEncoder().encode(
                `De : ${from?.name ?? ""} <${from?.address ?? ""}>\nObjet : ${mail.subject ?? ""}\n\n${mail.text}`,
              ),
            },
          ]
        : [];

  let count = 0;
  for (const file of files.slice(0, 20)) {
    try {
      const doc = await storeDocument({ organizationId: org.id, file, source: "EMAIL" });
      await enqueue("document.process", {
        documentId: doc.id,
        emailSubject: mail.subject ?? null,
        fromName: from?.name ?? null,
      });
      count++;
    } catch (error) {
      logger.warn({ err: error, file: file.name }, "Pièce jointe refusée");
    }
  }
  await db.messageLog.updateMany({
    where: { provider: "inbound-mail", externalId: messageId },
    data: { status: count ? "processed" : "empty" },
  });
  return { status: "processed", organizationId: org.id, documents: count };
}
