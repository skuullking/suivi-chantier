import { requireManager } from "@/server/auth/context";
import { toDateKey, today } from "@/lib/dates";
import { isStepLate } from "@/server/domain/progress";
import { loadSite } from "../site-data";
import { StepsEditor } from "./steps-editor";

export default async function SiteStepsPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireManager();
  const { id } = await params;
  const site = await loadSite(ctx, id);
  const day = today(ctx.organizationTimeZone);
  return (
    <StepsEditor
      siteId={id}
      steps={site.steps.map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        weight: s.weight,
        visibleToClient: s.visibleToClient,
        plannedStart: s.plannedStart ? toDateKey(s.plannedStart) : "",
        plannedEnd: s.plannedEnd ? toDateKey(s.plannedEnd) : "",
        late: isStepLate(s, day),
      }))}
    />
  );
}
