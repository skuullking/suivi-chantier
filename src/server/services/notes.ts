import type { NoteKind } from "@/generated/prisma/enums";
import type { ServiceContext } from "@/server/auth/context";
import { db, type Tx } from "@/server/db";
import { loadSiteFor } from "./access";
import { recordSiteEvent } from "./events";
import { notifyManagers } from "./notifications";

export type NoteCreate = { text: string; kind?: NoteKind; internal?: boolean; mediaId?: string | null };

/**
 * Adds a note to a site journal. Problems are ALWAYS internal (never shown to the client) and notify managers.
 */
export async function createNote(ctx: ServiceContext, siteId: string, input: NoteCreate, tx?: Tx) {
  const { site } = await loadSiteFor(ctx, siteId, "note.create", tx);
  const kind = input.kind ?? "NOTE";
  const internal = kind === "PROBLEM" ? true : (input.internal ?? true);
  const run = async (t: Tx) => {
    const note = await t.note.create({
      data: {
        organizationId: ctx.organizationId,
        siteId,
        authorId: ctx.userId,
        kind,
        text: input.text,
        internal,
        mediaId: input.mediaId ?? null,
      },
    });
    await recordSiteEvent(
      {
        organizationId: ctx.organizationId,
        siteId,
        actorId: ctx.userId,
        type: kind === "PROBLEM" ? "problem.reported" : "note.added",
      },
      t,
    );
    if (kind === "PROBLEM") {
      await notifyManagers(
        {
          organizationId: ctx.organizationId,
          type: "problem.reported",
          title: `Problème signalé : ${site.title}`,
          body: input.text.slice(0, 200),
          link: `/app/chantiers/${siteId}/journal`,
          excludeUserId: ctx.userId,
        },
        t,
      );
    }
    return note;
  };
  return tx ? run(tx) : db.$transaction(run);
}

/** Journal of a site: notes + daily summaries + events, newest first. */
export async function siteJournal(ctx: ServiceContext, siteId: string) {
  await loadSiteFor(ctx, siteId, "site.view");
  const [notes, summaries, events] = await Promise.all([
    db.note.findMany({
      where: { organizationId: ctx.organizationId, siteId },
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.dailySummary.findMany({
      where: { organizationId: ctx.organizationId, siteId },
      orderBy: { date: "desc" },
      take: 60,
    }),
    db.siteEvent.findMany({
      where: { organizationId: ctx.organizationId, siteId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const actorIds = Array.from(new Set(events.map((e) => e.actorId).filter((id): id is string => !!id)));
  const actors = await db.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true },
  });
  const names = new Map(actors.map((a) => [a.id, a.name]));
  return {
    notes,
    summaries,
    events: events.map((e) => ({ ...e, actorName: e.actorId ? (names.get(e.actorId) ?? null) : null })),
  };
}
