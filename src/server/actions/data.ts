"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { requireManager } from "@/server/auth/context";
import { CLIENT_IMPORT_FIELDS } from "@/server/domain/csv-mapping";
import { enqueue } from "@/server/jobs/queue";
import { importClients, MAX_IMPORT_ROWS } from "@/server/services/client-import";
import { requestHandover } from "@/server/services/handover";
import { attempt } from "./helpers";

const mappingSchema = z.object(
  Object.fromEntries(
    CLIENT_IMPORT_FIELDS.map((f) => [f.key, z.string().max(200).nullable().optional()]),
  ) as Record<(typeof CLIENT_IMPORT_FIELDS)[number]["key"], z.ZodOptional<z.ZodNullable<z.ZodString>>>,
);
const rowsSchema = z.array(z.record(z.string().max(300), z.string().max(5000))).max(MAX_IMPORT_ROWS);

export async function importClientsAction(rows: unknown, mapping: unknown): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    const result = await importClients(ctx, rowsSchema.parse(rows), mappingSchema.parse(mapping));
    revalidatePath("/app/clients");
    return {
      ok: true,
      message: `${result.created} client(s) importé(s), ${result.skipped} ignoré(s) (doublons ou lignes vides)${result.errorCount ? `, ${result.errorCount} erreur(s)` : ""}.`,
      data: result,
    };
  });
}

export async function generateHandoverAction(siteId: string, signatures: boolean): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    const id = z.string().min(1).max(64).parse(siteId);
    await requestHandover(ctx, id);
    await enqueue("handover.generate", {
      organizationId: ctx.organizationId,
      siteId: id,
      userId: ctx.userId,
      signatures,
    });
    revalidatePath(`/app/chantiers/${id}`, "layout");
    return {
      ok: true,
      message:
        "Dossier de fin de chantier en préparation : il apparaîtra dans les documents dans quelques secondes.",
    };
  });
}
