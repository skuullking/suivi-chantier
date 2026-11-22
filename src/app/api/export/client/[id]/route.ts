import { Readable } from "node:stream";
import { getAuthContext } from "@/server/auth/context";
import { AppError } from "@/server/errors";
import { exportClient } from "@/server/services/gdpr";

export const dynamic = "force-dynamic";

/** GDPR: export of all the data of one client (right of access / portability). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role === "WORKER") return new Response("Accès refusé", { status: 403 });
  const { id } = await params;
  try {
    const { fileName, stream } = await exportClient(ctx, id);
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
