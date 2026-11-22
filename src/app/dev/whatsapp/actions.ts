"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { simulatorMediaKey } from "@/server/adapters/messaging";
import { storage } from "@/server/adapters/storage";
import { simulatorTranscriptKey } from "@/server/adapters/transcription";
import { samplePdf, samplePhoto, sampleVoice } from "@/server/dev/fixtures";
import { devToolsEnabled, env } from "@/server/env";
import { signWhatsAppBody } from "@/server/security/webhook-signature";

const schema = z.object({
  from: z.string().regex(/^\+\d{8,15}$/, "Numéro au format +33612345678."),
  name: z.string().max(80).optional(),
  type: z.enum(["text", "image", "audio", "document"]),
  text: z.string().max(4000).optional(),
  caption: z.string().max(500).optional(),
  transcript: z.string().max(4000).optional(),
});

/**
 * Builds a payload in the exact Meta format, signs it with WHATSAPP_APP_SECRET and posts it to the real webhook
 * of this application (the whole reception path is exercised).
 */
export async function simulateWhatsAppAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!devToolsEnabled()) return { ok: false, error: "Outils de développement désactivés." };
  const parsed = schema.safeParse(
    Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")),
  );
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const input = parsed.data;
  const upload = formData.get("file");
  const file = upload instanceof File && upload.size > 0 ? upload : null;

  const wamid = `wamid.SIM${randomUUID().replace(/-/g, "")}`;
  const message: Record<string, unknown> = {
    from: input.from.replace(/^\+/, ""),
    id: wamid,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: input.type,
  };

  if (input.type === "text") {
    if (!input.text?.trim()) return { ok: false, error: "Écrivez un message." };
    message.text = { body: input.text };
  } else {
    const mediaId = randomUUID().replace(/-/g, "");
    let bytes: Buffer;
    let mimeType: string;
    let fileName: string;
    if (file) {
      bytes = Buffer.from(await file.arrayBuffer());
      mimeType = file.type || "application/octet-stream";
      fileName = file.name;
    } else if (input.type === "image") {
      bytes = await samplePhoto(input.caption || "Photo de chantier (simulation)");
      mimeType = "image/jpeg";
      fileName = "photo.jpg";
    } else if (input.type === "audio") {
      bytes = sampleVoice();
      mimeType = "audio/wav";
      fileName = "vocal.wav";
    } else {
      bytes = await samplePdf(input.caption || "Facture", (input.text || "Facture fournisseur").split("\n"));
      mimeType = "application/pdf";
      fileName = `${(input.caption || "document").replace(/[^\w-]+/g, "_")}.pdf`;
    }
    const key = simulatorMediaKey(mediaId);
    await storage().put(key, bytes, mimeType);
    await storage().put(
      `${key}.json`,
      Buffer.from(JSON.stringify({ mimeType, fileName })),
      "application/json",
    );
    if (input.type === "audio" && input.transcript?.trim()) {
      await storage().put(
        simulatorTranscriptKey(new Uint8Array(bytes)),
        Buffer.from(input.transcript.trim()),
        "text/plain",
      );
    }
    const media = {
      id: mediaId,
      mime_type: mimeType,
      sha256: "",
      ...(input.caption ? { caption: input.caption } : {}),
    };
    if (input.type === "image") message.image = media;
    if (input.type === "audio") message.audio = { ...media, voice: true };
    if (input.type === "document") message.document = { ...media, filename: fileName };
  }

  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "SIMULATED_WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: env().WHATSAPP_BUSINESS_NUMBER,
                phone_number_id: "SIMULATED",
              },
              contacts: [
                { wa_id: input.from.replace(/^\+/, ""), profile: { name: input.name || "Simulateur" } },
              ],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
  const body = JSON.stringify(payload);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const res = await fetch(`${proto}://${host}/api/webhooks/whatsapp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": signWhatsAppBody(body, env().WHATSAPP_APP_SECRET),
    },
    body,
  });
  if (!res.ok) return { ok: false, error: `Webhook : ${res.status} ${await res.text()}` };
  return { ok: true, message: "Message envoyé au webhook ✔" };
}
