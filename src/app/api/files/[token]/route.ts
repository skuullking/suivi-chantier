import { Readable } from "node:stream";
import { storage } from "@/server/adapters/storage";
import { verifyFileToken } from "@/server/files";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";

function contentDisposition(disposition: "inline" | "attachment", filename?: string) {
  if (!filename) return disposition;
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Streams a private file after verifying its signed, expiring token. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const file = verifyFileToken(token);
  if (!file) return new Response("Lien expiré ou invalide.", { status: 403 });
  try {
    const object = await storage().getStream(file.key);
    const headers = new Headers({
      "Content-Type": file.contentType ?? object.contentType ?? "application/octet-stream",
      "Content-Disposition": contentDisposition(file.disposition, file.filename),
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
      // Uploaded files are never executed (SVG / HTML uploads are rejected at validation time).
      "Content-Security-Policy":
        "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
    });
    if (object.size !== undefined) headers.set("Content-Length", String(object.size));
    return new Response(Readable.toWeb(object.stream) as ReadableStream, { headers });
  } catch (error) {
    logger.warn({ err: error, key: file.key }, "Fichier introuvable");
    return new Response("Fichier introuvable.", { status: 404 });
  }
}
