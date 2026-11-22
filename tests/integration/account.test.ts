import type { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { storage } from "@/server/adapters/storage";
import { db } from "@/server/db";
import { samplePdf } from "@/server/dev/fixtures";
import { AppError, ForbiddenError, ValidationError } from "@/server/errors";
import {
  applyBillingEvent,
  assertSubscriptionUsable,
  mockSubscribe,
  subscriptionOverview,
} from "@/server/services/billing";
import { uploadDocuments } from "@/server/services/documents";
import {
  anonymizeClient,
  deleteClientCompletely,
  deleteOrganization,
  exportOrganization,
  runRetentionPurge,
  updateRetention,
} from "@/server/services/gdpr";
import { createDemoSite, onboardingState } from "@/server/services/onboarding";
import { createPortalLink, resolvePortalToken } from "@/server/services/portal";
import { createSite } from "@/server/services/sites";
import { createInvitation } from "@/server/services/team";
import { addMember, createOrganization } from "./helpers";

async function zipText(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks).toString("latin1");
}

afterEach(() => {
  delete process.env.BILLING_ENABLED;
});

describe("subscription", () => {
  it("shows the plan and usage, activates a plan with the mock provider", async () => {
    const { ownerCtx, organization } = await createOrganization();
    const overview = await subscriptionOverview(ownerCtx);
    expect(overview).toMatchObject({ provider: "mock", status: "TRIALING", trialDaysLeft: 14 });
    await mockSubscribe(ownerCtx, "PRO");
    const org = await db.organization.findUniqueOrThrow({
      where: { id: organization.id },
      include: { subscription: true },
    });
    expect(org).toMatchObject({ plan: "PRO", subscriptionStatus: "ACTIVE" });
    expect(org.subscription?.status).toBe("ACTIVE");
  });

  it("only the owner manages billing", async () => {
    const { organization } = await createOrganization();
    const office = await addMember(organization.id, "OFFICE");
    await expect(subscriptionOverview(office.ctx)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("applies Stripe webhook events", async () => {
    const { organization } = await createOrganization();
    await applyBillingEvent({
      type: "subscription.activated",
      organizationId: organization.id,
      customerId: "cus_123",
      subscriptionId: "sub_123",
      plan: "SOLO",
      status: "ACTIVE",
      currentPeriodEnd: null,
    });
    expect((await db.organization.findUniqueOrThrow({ where: { id: organization.id } })).plan).toBe("SOLO");
    await applyBillingEvent({
      type: "subscription.canceled",
      customerId: "cus_123",
      subscriptionId: "sub_123",
    });
    expect(
      (await db.organization.findUniqueOrThrow({ where: { id: organization.id } })).subscriptionStatus,
    ).toBe("CANCELED");
  });

  it("enforces limits only when billing is enabled", async () => {
    const { organization, ownerCtx } = await createOrganization();
    await db.organization.update({
      where: { id: organization.id },
      data: { plan: "SOLO", trialEndsAt: new Date(Date.now() - 1000) },
    });
    await addMember(organization.id, "WORKER");
    // Billing disabled: everything is allowed.
    await expect(assertSubscriptionUsable(organization.id)).resolves.toBeUndefined();
    await expect(
      createInvitation(ownerCtx, { email: "x@test.fr", name: null, role: "WORKER" }),
    ).resolves.toBeTruthy();
    process.env.BILLING_ENABLED = "true";
    await expect(assertSubscriptionUsable(organization.id)).rejects.toBeInstanceOf(AppError);
    await expect(
      createSite(ownerCtx, { newClient: { name: "Client" }, info: { title: "Chantier", address: "1 rue" } }),
    ).rejects.toThrow(/essai est terminée/);
    // SOLO = 2 accounts: owner + worker (+ pending invitation) is already the limit.
    await expect(
      createInvitation(ownerCtx, { email: "y@test.fr", name: null, role: "WORKER" }),
    ).rejects.toThrow(/limitée à 2/);
  });
});

describe("GDPR", () => {
  it("exports the whole organization without secrets", async () => {
    const { ownerCtx } = await createOrganization();
    const site = await createSite(ownerCtx, {
      newClient: { name: "M. Export" },
      info: { title: "Chantier export", address: "1 rue" },
    });
    await uploadDocuments(
      ownerCtx,
      [{ name: "devis.pdf", bytes: new Uint8Array(await samplePdf("Devis", ["x"])) }],
      { siteId: site.id, type: "QUOTE" },
    );
    await createPortalLink(ownerCtx, site.id);
    const { stream, fileName } = await exportOrganization(ownerCtx);
    expect(fileName).toMatch(/^export-.+\.zip$/);
    const text = await zipText(stream);
    expect(text).toContain("donnees.json");
    expect(text).toContain("fichiers/documents/");
    expect(text).not.toContain("passwordHash");
    expect(text).not.toContain("tokenHash");
  });

  it("anonymizes a client and revokes its portal links, keeping the sites", async () => {
    const { ownerCtx } = await createOrganization();
    const site = await createSite(ownerCtx, {
      newClient: {
        name: "Mme Privée",
        emails: "privee@exemple.fr",
        phones: "0612345678",
        addresses: "3 rue Secrète",
      },
      info: { title: "Chantier privé", address: "3 rue Secrète" },
    });
    const { token } = await createPortalLink(ownerCtx, site.id);
    await anonymizeClient(ownerCtx, site.clientId);
    const client = await db.client.findUniqueOrThrow({ where: { id: site.clientId } });
    expect(client.name).toMatch(/^Client anonymisé/);
    expect(client).toMatchObject({ emails: [], phones: [], addresses: [], notes: null });
    expect(client.anonymizedAt).not.toBeNull();
    expect((await resolvePortalToken(token)).status).toBe("expired");
    expect(await db.site.count({ where: { id: site.id } })).toBe(1);
  });

  it("deletes a client with all its data and files", async () => {
    const { ownerCtx } = await createOrganization();
    const site = await createSite(ownerCtx, {
      newClient: { name: "À effacer" },
      info: { title: "Chantier", address: "1 rue" },
    });
    const { created } = await uploadDocuments(
      ownerCtx,
      [{ name: "doc.pdf", bytes: new Uint8Array(await samplePdf("Doc", ["x"])) }],
      { siteId: site.id, type: "OTHER" },
    );
    const doc = await db.document.findUniqueOrThrow({ where: { id: created[0]!.id } });
    await expect(deleteClientCompletely(ownerCtx, site.clientId, "non")).rejects.toBeInstanceOf(
      ValidationError,
    );
    await deleteClientCompletely(ownerCtx, site.clientId, "supprimer");
    expect(await db.client.count({ where: { id: site.clientId } })).toBe(0);
    expect(await db.site.count({ where: { id: site.id } })).toBe(0);
    expect(await storage().exists(doc.storageKey)).toBe(false);
  });

  it("deletes the account only with the exact name and password", async () => {
    const { ownerCtx, organization, owner } = await createOrganization();
    const worker = await addMember(organization.id, "WORKER");
    await expect(
      deleteOrganization(ownerCtx, { organizationName: "autre", password: "motdepasse-solide" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      deleteOrganization(ownerCtx, { organizationName: organization.name, password: "faux" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      deleteOrganization(worker.ctx, { organizationName: organization.name, password: "x" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await deleteOrganization(ownerCtx, {
      organizationName: organization.name,
      password: "motdepasse-solide",
    });
    expect(await db.organization.count({ where: { id: organization.id } })).toBe(0);
    expect(await db.user.count({ where: { id: { in: [owner.id, worker.user.id] } } })).toBe(0);
  });

  it("purges old files only when enabled, never documents younger than 10 years", async () => {
    const { ownerCtx, organization } = await createOrganization();
    await expect(
      updateRetention(ownerCtx, {
        retentionDocumentsYears: 5,
        retentionMediaYears: 2,
        retentionPurgeEnabled: true,
      }),
    ).rejects.toThrow(/10 ans/);
    const site = await createSite(ownerCtx, {
      newClient: { name: "Ancien" },
      info: { title: "Vieux chantier", address: "1 rue" },
    });
    const { created } = await uploadDocuments(
      ownerCtx,
      [{ name: "vieux.pdf", bytes: new Uint8Array(await samplePdf("Vieux", ["x"])) }],
      { siteId: site.id, type: "INVOICE" },
    );
    await db.document.update({
      where: { id: created[0]!.id },
      data: { documentDate: new Date("2010-01-01") },
    });
    expect(await runRetentionPurge()).toEqual({ media: 0, documents: 0 });
    await updateRetention(ownerCtx, {
      retentionDocumentsYears: 10,
      retentionMediaYears: 2,
      retentionPurgeEnabled: true,
    });
    expect(await runRetentionPurge()).toEqual({ media: 0, documents: 1 });
    expect(
      await db.auditLog.count({ where: { organizationId: organization.id, action: "retention.purge" } }),
    ).toBe(1);
  });
});

describe("onboarding", () => {
  it("creates an example site with a client link", async () => {
    const { ownerCtx } = await createOrganization();
    const before = await onboardingState(ownerCtx);
    expect(before.steps).toMatchObject({ site: false, portal: false });
    const { portalUrl, siteId } = await createDemoSite(ownerCtx);
    expect(portalUrl).toMatch(/\/s\/[A-Za-z0-9_-]{43}$/);
    const site = await db.site.findUniqueOrThrow({ where: { id: siteId }, include: { client: true } });
    expect(site.client.name).toBe("Client exemple (fictif)");
    expect(site.progress).toBeGreaterThan(0);
    const after = await onboardingState(ownerCtx);
    expect(after.steps).toMatchObject({ client: true, site: true, portal: true });
  });
});
