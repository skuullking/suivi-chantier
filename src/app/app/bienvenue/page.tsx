import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { DEFAULT_STEP_TEMPLATES } from "@/server/domain/step-templates";
import { requireManager } from "@/server/auth/context";
import { db } from "@/server/db";
import { onboardingState } from "@/server/services/onboarding";
import { listPortalLinks } from "@/server/services/portal";
import { OnboardingSteps } from "./onboarding-steps";

export const metadata: Metadata = { title: "Bienvenue" };

export default async function WelcomePage() {
  const ctx = await requireManager();
  const state = await onboardingState(ctx);
  const links = state.firstSite ? await listPortalLinks(ctx, state.firstSite.id) : [];
  const templates = await db.stepTemplate.findMany({
    where: { organizationId: ctx.organizationId },
    include: { items: { orderBy: { order: "asc" } } },
  });
  return (
    <>
      <PageHeader
        title={`Bienvenue sur ChantierLink, ${ctx.user.name.split(" ")[0]} !`}
        description="Votre entreprise est créée et votre essai gratuit de 14 jours commence. 4 étapes, 10 minutes."
      />
      <OnboardingSteps
        isOwner={ctx.role === "OWNER"}
        trade={state.trade}
        templates={Object.fromEntries(
          DEFAULT_STEP_TEMPLATES.map((t) => [
            t.trade,
            templates.find((x) => x.trade === t.trade)?.items.map((i) => i.title) ?? t.steps,
          ]),
        )}
        done={state.steps}
        firstSite={state.firstSite}
        portalUrl={links.find((l) => l.url)?.url ?? null}
      />
    </>
  );
}
