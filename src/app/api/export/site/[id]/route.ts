import { Readable } from "node:stream";
import { getAuthContext } from "@/server/auth/context";
import { AppError } from "@/server/errors";
import { siteZip } from "@/server/services/exports";

export const dynamic = "force-dynamic";

/** Complete ZIP export of a site (documents, photos by step, journal, steps). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role === "WORKER") return new Response("Accès refusé", { status: 403 });
  const { id } = await params;
  try {
    const { fileName, stream } = await siteZip(ctx, id);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(error.message, { status: error.status });
    throw error;
  }
}
