/** Sites a member may be talking about (candidates for automatic attachment). */
import { addDays, startOfWeek, today } from "@/lib/dates";
import type { ServiceContext } from "@/server/auth/context";
import { db } from "@/server/db";
import type { SiteCandidate } from "@/server/domain/site-resolver";

export async function siteCandidates(ctx: ServiceContext): Promise<SiteCandidate[]> {
  const day = today(ctx.organizationTimeZone);
  const weekStart = startOfWeek(day);
  const [sites, assignments] = await Promise.all([
    db.site.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ["DRAFT", "PLANNED", "IN_PROGRESS", "PAUSED"] },
        ...(ctx.actor.role === "WORKER" ? { members: { some: { userId: ctx.userId } } } : {}),
      },
      include: {
        client: { select: { name: true } },
        steps: { select: { id: true, title: true, status: true, order: true } },
        members: { where: { userId: ctx.userId }, select: { userId: true } },
      },
    }),
    db.assignment.findMany({
      where: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        date: { gte: weekStart, lte: addDays(weekStart, 6) },
      },
      select: { siteId: true, date: true },
    }),
  ]);
  return sites.map((s) => ({
    id: s.id,
    code: s.code,
    title: s.title,
    clientName: s.client.name,
    city: s.city,
    address: s.address,
    latitude: s.latitude,
    longitude: s.longitude,
    plannedToday: assignments.some((a) => a.siteId === s.id && a.date.getTime() === day.getTime()),
    plannedThisWeek: assignments.some((a) => a.siteId === s.id) || s.members.length > 0,
    steps: s.steps,
  }));
}
