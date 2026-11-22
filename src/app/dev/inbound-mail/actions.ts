"use server";

import { headers } from "next/headers";
import nodemailer from "nodemailer";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { samplePdf } from "@/server/dev/fixtures";
import { devToolsEnabled, env } from "@/server/env";

const schema = z.object({
  to: z.email(),
  from: z.email(),
  fromName: z.string().max(80).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().max(20_000).optional(),
  attachmentTitle: z.string().max(120).optional(),
  attachmentText: z.string().max(20_000).optional(),
});

/** Builds a real MIME message and posts it to the inbound mail webhook (with the shared secret). */
export async function simulateInboundMailAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!devToolsEnabled()) return { ok: false, error: "Outils de développement désactivés." };
  const parsed = schema.safeParse(
    Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")),
  );
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const input = parsed.data;
  const upload = formData.get("file");
  const attachments: { filename: string; content: Buffer; contentType?: string }[] = [];
  if (upload instanceof File && upload.size > 0) {
    attachments.push({
      filename: upload.name,
      content: Buffer.from(await upload.arrayBuffer()),
      contentType: upload.type || undefined,
    });
  } else if (input.attachmentText?.trim()) {
    const title = input.attachmentTitle?.trim() || "Facture";
    attachments.push({
      filename: `${title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "document"}.pdf`,
      content: await samplePdf(title, input.attachmentText.split("\n")),
      contentType: "application/pdf",
    });
  }
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  const info = await transport.sendMail({
    from: input.fromName ? `"${input.fromName}" <${input.from}>` : input.from,
    to: input.to,
    subject: input.subject ?? "",
    text: input.body ?? "",
    attachments,
  });
  const raw = info.message as Buffer;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const res = await fetch(`${proto}://${host}/api/webhooks/inbound-mail`, {
    method: "POST",
    headers: { "Content-Type": "message/rfc822", "X-Inbound-Secret": env().INBOUND_MAIL_SECRET },
    body: new Uint8Array(raw),
  });
  const result = (await res.json().catch(() => ({}))) as { status?: string; documents?: number };
  if (!res.ok) return { ok: false, error: `Webhook : ${res.status}` };
  if (result.status === "unknown_recipient") return { ok: false, error: "Adresse de destination inconnue." };
  return { ok: true, message: `E-mail reçu ✔ ${result.documents ?? 0} document(s) en cours de classement.` };
}
