import { Readable } from "node:stream";
import type { DocumentType } from "@/generated/prisma/enums";
import { DOCUMENT_TYPES } from "@/lib/validation/business";
import { getAuthContext } from "@/server/auth/context";
import { AppError } from "@/server/errors";
import { clientsCsv, documentsCsv, documentsZip, sitesCsv } from "@/server/services/exports";

export const dynamic = "force-dynamic";

function attachment(name: string) {
  return `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** CSV exports (clients, chantiers, documents) and ZIP of documents (with the current filters). */
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role === "WORKER") return new Response("Accès refusé", { status: 403 });
  const { kind } = await params;
  const sp = new URL(request.url).searchParams;
  const type = sp.get("type");
  const filters = {
    q: sp.get("q") ?? undefined,
    type: type && (DOCUMENT_TYPES as readonly string[]).includes(type) ? (type as DocumentType) : undefined,
    clientId: sp.get("client") ?? undefined,
    siteId: sp.get("chantier") ?? undefined,
    from: sp.get("du") ?? undefined,
    to: sp.get("au") ?? undefined,
  };
  const day = new Date().toISOString().slice(0, 10);
  try {
    const csvHeaders = (name: string) => ({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": attachment(name),
      "Cache-Control": "no-store",
    });
    switch (kind) {
      case "clients.csv":
        return new Response(await clientsCsv(ctx), { headers: csvHeaders(`clients-${day}.csv`) });
      case "chantiers.csv":
        return new Response(await sitesCsv(ctx), { headers: csvHeaders(`chantiers-${day}.csv`) });
      case "documents.csv":
        return new Response(await documentsCsv(ctx, filters), {
          headers: csvHeaders(`documents-${day}.csv`),
        });
      case "documents.zip": {
        const { fileName, stream } = await documentsZip(ctx, filters);
        return new Response(Readable.toWeb(stream) as ReadableStream, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": attachment(fileName),
            "Cache-Control": "no-store",
          },
        });
      }
      default:
        return new Response("Export inconnu", { status: 404 });
    }
  } catch (error) {
    if (error instanceof AppError) return new Response(error.message, { status: error.status });
    throw error;
  }
}
