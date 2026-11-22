import { Readable } from "node:stream";
import { getAuthContext } from "@/server/auth/context";
import { AppError } from "@/server/errors";
import { exportOrganization } from "@/server/services/gdpr";

export const dynamic = "force-dynamic";

/** GDPR: complete export of the organization (owner only). */
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return new Response("Non connecté", { status: 401 });
  try {
    const { fileName, stream } = await exportOrganization(ctx);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(error.message, { status: error.status });
    throw error;
  }
}
