/**
 * WhatsApp messaging. `mock`: replies are only logged (visible in the /dev/whatsapp simulator) and media are read
 * from the simulator store. `meta`: WhatsApp Cloud API (Graph API).
 */
import { storage } from "@/server/adapters/storage";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { logger } from "@/server/logger";

export type DownloadedMedia = { bytes: Uint8Array; mimeType: string; fileName?: string };

export interface MessagingProvider {
  readonly name: string;
  sendText(to: string, text: string, organizationId?: string | null): Promise<{ id: string }>;
  downloadMedia(mediaId: string): Promise<DownloadedMedia>;
}

/** Key where the simulator stores the bytes of a fake WhatsApp media. */
export function simulatorMediaKey(mediaId: string) {
  return `dev/whatsapp-media/${mediaId.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

async function logOutbound(
  provider: string,
  to: string,
  text: string,
  organizationId?: string | null,
  externalId?: string,
) {
  return db.messageLog.create({
    data: {
      organizationId: organizationId ?? null,
      channel: "WHATSAPP",
      direction: "OUTBOUND",
      provider,
      externalId: externalId ?? null,
      fromAddress: env().WHATSAPP_BUSINESS_NUMBER,
      toAddress: to,
      body: text,
      status: "sent",
    },
  });
}

export class MockMessagingProvider implements MessagingProvider {
  readonly name = "mock";

  async sendText(to: string, text: string, organizationId?: string | null) {
    const log = await logOutbound("whatsapp-mock", to, text, organizationId);
    return { id: log.id };
  }

  async downloadMedia(mediaId: string): Promise<DownloadedMedia> {
    const key = simulatorMediaKey(mediaId);
    const bytes = await storage().get(key);
    const meta = await storage()
      .get(`${key}.json`)
      .then((b) => JSON.parse(b.toString("utf8")) as { mimeType: string; fileName?: string })
      .catch(() => ({ mimeType: "application/octet-stream", fileName: undefined }));
    return { bytes: new Uint8Array(bytes), mimeType: meta.mimeType, fileName: meta.fileName };
  }
}

export class MetaMessagingProvider implements MessagingProvider {
  readonly name = "meta";
  private readonly base: string;

  constructor(
    private readonly accessToken: string,
    private readonly phoneNumberId: string,
    version: string,
  ) {
    this.base = `https://graph.facebook.com/${version}`;
  }

  async sendText(to: string, text: string, organizationId?: string | null) {
    const res = await fetch(`${this.base}/${this.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/^\+/, ""),
        type: "text",
        text: { body: text, preview_url: true },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message: string };
    };
    if (!res.ok) {
      logger.error({ status: res.status, error: body.error }, "Envoi WhatsApp refusé");
      throw new Error(`WhatsApp : ${body.error?.message ?? res.status}`);
    }
    const id = body.messages?.[0]?.id;
    await logOutbound("whatsapp", to, text, organizationId, id);
    return { id: id ?? "" };
  }

  async downloadMedia(mediaId: string): Promise<DownloadedMedia> {
    const headers = { Authorization: `Bearer ${this.accessToken}` };
    const metaRes = await fetch(`${this.base}/${encodeURIComponent(mediaId)}`, { headers });
    if (!metaRes.ok) throw new Error(`Média WhatsApp introuvable (${metaRes.status})`);
    const meta = (await metaRes.json()) as { url: string; mime_type: string };
    const fileRes = await fetch(meta.url, { headers });
    if (!fileRes.ok) throw new Error(`Téléchargement du média WhatsApp impossible (${fileRes.status})`);
    return { bytes: new Uint8Array(await fileRes.arrayBuffer()), mimeType: meta.mime_type };
  }
}

let provider: MessagingProvider | null = null;

export function messaging(): MessagingProvider {
  if (provider) return provider;
  const e = env();
  if (e.WHATSAPP_PROVIDER === "meta" && e.WHATSAPP_ACCESS_TOKEN && e.WHATSAPP_PHONE_NUMBER_ID) {
    provider = new MetaMessagingProvider(
      e.WHATSAPP_ACCESS_TOKEN,
      e.WHATSAPP_PHONE_NUMBER_ID,
      e.WHATSAPP_API_VERSION,
    );
  } else {
    if (e.WHATSAPP_PROVIDER === "meta") logger.warn("WHATSAPP_PROVIDER=meta incomplet : mode simulé utilisé");
    provider = new MockMessagingProvider();
  }
  return provider;
}

export function setMessagingProvider(p: MessagingProvider | null) {
  provider = p;
}
