import { describe, expect, it } from "vitest";
import {
  assignmentSchema,
  clientSchema,
  documentUpdateSchema,
  siteInfoSchema,
} from "@/lib/validation/business";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { createClient, getClient, listClients } from "@/server/services/clients";
import {
  deleteDocument,
  getDocument,
  listDocuments,
  listSiteDocuments,
  updateDocument,
  uploadDocuments,
} from "@/server/services/documents";
import { createNote } from "@/server/services/notes";
import { createAssignment, listAssignments } from "@/server/services/planning";
import { globalSearch } from "@/server/services/search";
import { createSite, getSite, listSites, setSiteMembers } from "@/server/services/sites";
import { reorderSteps, setStepStatus } from "@/server/services/steps";
import { parseDateOnly } from "@/lib/dates";
import { addMember, createOrganization } from "./helpers";

const PDF = (text: string) => new TextEncoder().encode(`%PDF-1.4\n% ${text}\n%%EOF`);

async function setup() {
  const a = await createOrganization("Charpentes A");
  const b = await createOrganization("Menuiserie B");
  const office = await addMember(a.organization.id, "OFFICE", "Bureau");
  const worker = await addMember(a.organization.id, "WORKER", "Ouvrier");
  const otherWorker = await addMember(a.organization.id, "WORKER", "Autre");
  const template = await db.stepTemplate.findFirstOrThrow({
    where: { organizationId: a.organization.id, trade: "CARPENTER" },
    include: { items: true },
  });
  const site = await createSite(a.ownerCtx, {
    newClient: { name: "M. Dupont", phones: "0612345678" },
    info: { title: "Charpente Dupont", address: "8 chemin des Vignes", city: "Castanet" },
    templateId: template.id,
    memberIds: [worker.user.id],
  });
  const foreignSite = await createSite(b.ownerCtx, {
    newClient: { name: "Client de B" },
    info: { title: "Chantier secret de B", address: "1 rue de B" },
  });
  return { a, b, office, worker, otherWorker, template, site, foreignSite };
}

describe("sites", () => {
  it("creates a site from a template with a short code and its team", async () => {
    const { site, template, worker } = await setup();
    const full = await db.site.findUniqueOrThrow({
      where: { id: site.id },
      include: { steps: { orderBy: { order: "asc" } }, members: true, client: true },
    });
    expect(full.code).toBe("DUP-1");
    expect(full.status).toBe("DRAFT");
    expect(full.steps.map((s) => s.title)).toEqual(
      [...template.items].sort((x, y) => x.order - y.order).map((i) => i.title),
    );
    expect(full.members.map((m) => m.userId)).toEqual([worker.user.id]);
    expect(full.client.name).toBe("M. Dupont");
  });

  it("recomputes the weighted progress and starts the site", async () => {
    const { a, site } = await setup();
    const steps = await db.siteStep.findMany({ where: { siteId: site.id }, orderBy: { order: "asc" } });
    await db.siteStep.update({ where: { id: steps[0]!.id }, data: { weight: 3 } });
    const { progress } = await setStepStatus(a.ownerCtx, steps[0]!.id, "DONE");
    // 3 / (3 + 7 × 1) = 30 %
    expect(progress).toBe(30);
    const updated = await db.site.findUniqueOrThrow({ where: { id: site.id } });
    expect(updated.progress).toBe(30);
    expect(updated.status).toBe("IN_PROGRESS");
    expect(updated.actualStart).not.toBeNull();
  });

  it("reorders steps and refuses a stale list", async () => {
    const { a, site } = await setup();
    const steps = await db.siteStep.findMany({ where: { siteId: site.id }, orderBy: { order: "asc" } });
    const reversed = [...steps].reverse().map((s) => s.id);
    await reorderSteps(a.ownerCtx, site.id, reversed);
    const after = await db.siteStep.findMany({ where: { siteId: site.id }, orderBy: { order: "asc" } });
    expect(after.map((s) => s.id)).toEqual(reversed);
    await expect(reorderSteps(a.ownerCtx, site.id, reversed.slice(1))).rejects.toThrow();
  });

  it("workers only see the sites of their team", async () => {
    const { worker, otherWorker, site } = await setup();
    expect((await listSites(worker.ctx)).map((s) => s.id)).toEqual([site.id]);
    expect(await listSites(otherWorker.ctx)).toHaveLength(0);
    await expect(getSite(otherWorker.ctx, site.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getSite(worker.ctx, site.id)).resolves.toMatchObject({ id: site.id });
  });

  it("workers cannot create sites or edit steps but can complete steps of their sites", async () => {
    const { worker, otherWorker, site } = await setup();
    await expect(
      createSite(worker.ctx, {
        newClient: { name: "X client" },
        info: { title: "Pirate", address: "1 rue" },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const step = await db.siteStep.findFirstOrThrow({ where: { siteId: site.id } });
    await expect(setStepStatus(worker.ctx, step.id, "DONE")).resolves.toMatchObject({
      progress: expect.any(Number),
    });
    await expect(setStepStatus(worker.ctx, step.id, "TODO")).rejects.toThrow();
    await expect(setStepStatus(otherWorker.ctx, step.id, "DONE")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("validates the site dates", () => {
    expect(
      siteInfoSchema.safeParse({
        title: "Ok",
        address: "1 rue",
        plannedStart: "2026-02-02",
        plannedEnd: "2026-01-01",
      }).success,
    ).toBe(false);
  });
});

describe("multi-tenancy (IDOR)", () => {
  it("an organization never reads or modifies another organization's data", async () => {
    const { a, b, foreignSite } = await setup();
    const foreign = await db.site.findUniqueOrThrow({ where: { id: foreignSite.id } });
    await expect(getSite(a.ownerCtx, foreign.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getClient(a.ownerCtx, foreign.clientId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      createSite(a.ownerCtx, { clientId: foreign.clientId, info: { title: "Vol", address: "1 rue" } }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const foreignStep = await db.siteStep.create({
      data: { organizationId: b.organization.id, siteId: foreign.id, title: "Étape B", order: 1 },
    });
    await expect(setStepStatus(a.ownerCtx, foreignStep.id, "DONE")).rejects.toBeInstanceOf(NotFoundError);
    expect((await listSites(a.ownerCtx, { status: "ALL" })).some((s) => s.id === foreign.id)).toBe(false);
    expect((await listClients(a.ownerCtx)).some((c) => c.id === foreign.clientId)).toBe(false);
    expect(await globalSearch(a.ownerCtx, "secret")).toHaveLength(0);
    expect((await globalSearch(b.ownerCtx, "secret")).map((r) => r.id)).toContain(foreign.id);
  });

  it("cannot assign a member of another organization", async () => {
    const { a, b, site } = await setup();
    await expect(setSiteMembers(a.ownerCtx, site.id, [b.owner.id])).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      createAssignment(
        a.ownerCtx,
        assignmentSchema.parse({ siteId: site.id, userId: b.owner.id, date: "2026-11-23", slot: "FULL_DAY" }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("documents are isolated per organization", async () => {
    const { a, b, site } = await setup();
    const { created } = await uploadDocuments(a.ownerCtx, [{ name: "devis.pdf", bytes: PDF("devis") }], {
      siteId: site.id,
      type: "QUOTE",
    });
    const docId = created[0]!.id;
    await expect(getDocument(b.ownerCtx, docId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      updateDocument(
        b.ownerCtx,
        docId,
        documentUpdateSchema.parse({ name: "x", type: "OTHER", visibleToClient: "on" }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteDocument(b.ownerCtx, docId)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listDocuments(b.ownerCtx)).toHaveLength(0);
  });
});

describe("documents", () => {
  it("stores valid files, rejects dangerous ones and finds them by full-text search", async () => {
    const { a, site } = await setup();
    const { created, errors } = await uploadDocuments(
      a.ownerCtx,
      [
        { name: "Facture Scierie du Comminges.pdf", bytes: PDF("facture") },
        { name: "piege.pdf", bytes: new TextEncoder().encode("<html><script>alert(1)</script>") },
      ],
      { siteId: site.id, type: "INVOICE" },
    );
    expect(created).toHaveLength(1);
    expect(errors[0]).toMatch(/format/);
    const doc = await db.document.findUniqueOrThrow({ where: { id: created[0]!.id } });
    expect(doc.clientId).not.toBeNull();
    expect(doc.sha256).toMatch(/^[a-f0-9]{64}$/);
    const found = await listDocuments(a.ownerCtx, { q: "scierie comm" });
    expect(found.map((d) => d.id)).toEqual([doc.id]);
    expect(await listDocuments(a.ownerCtx, { q: "inexistant" })).toHaveLength(0);
  });

  it("workers only see plans of their sites and can upload expenses", async () => {
    const { a, worker, otherWorker, site } = await setup();
    await uploadDocuments(a.ownerCtx, [{ name: "plan.pdf", bytes: PDF("plan") }], {
      siteId: site.id,
      type: "PLAN",
    });
    await uploadDocuments(a.ownerCtx, [{ name: "facture.pdf", bytes: PDF("facture") }], {
      siteId: site.id,
      type: "INVOICE",
    });
    expect((await listSiteDocuments(worker.ctx, site.id)).map((d) => d.type)).toEqual(["PLAN"]);
    await expect(listSiteDocuments(otherWorker.ctx, site.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      uploadDocuments(worker.ctx, [{ name: "ticket.pdf", bytes: PDF("ticket") }], {
        siteId: site.id,
        type: "EXPENSE",
      }),
    ).resolves.toMatchObject({ created: [expect.anything()] });
    await expect(
      uploadDocuments(worker.ctx, [{ name: "devis.pdf", bytes: PDF("devis") }], {
        siteId: site.id,
        type: "QUOTE",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("planning, journal and notifications", () => {
  it("warns about conflicts and adds the person to the site team", async () => {
    const { a, otherWorker, site } = await setup();
    const other = await createSite(a.ownerCtx, {
      clientId: (await db.site.findUniqueOrThrow({ where: { id: site.id } })).clientId,
      info: { title: "Second chantier", address: "2 rue" },
    });
    const first = await createAssignment(
      a.ownerCtx,
      assignmentSchema.parse({
        siteId: site.id,
        userId: otherWorker.user.id,
        date: "2026-11-23",
        slot: "FULL_DAY",
      }),
    );
    expect(first.warnings).toHaveLength(0);
    const second = await createAssignment(
      a.ownerCtx,
      assignmentSchema.parse({
        siteId: other.id,
        userId: otherWorker.user.id,
        date: "2026-11-23",
        slot: "MORNING",
      }),
    );
    expect(second.warnings[0]).toMatch(/Déjà prévu/);
    const list = await listAssignments(a.ownerCtx, {
      from: parseDateOnly("2026-11-23"),
      to: parseDateOnly("2026-11-29"),
    });
    expect(list.every((x) => x.conflictIds.length === 1)).toBe(true);
    // Planned on the site → now part of the team → can see it.
    await expect(getSite(otherWorker.ctx, site.id)).resolves.toBeTruthy();
    // A worker only sees his own planning.
    const own = await listAssignments(otherWorker.ctx, {
      from: parseDateOnly("2026-11-23"),
      to: parseDateOnly("2026-11-29"),
    });
    expect(own.every((x) => x.userId === otherWorker.user.id)).toBe(true);
  });

  it("problems are always internal and notify the managers", async () => {
    const { a, office, worker, site } = await setup();
    const note = await createNote(worker.ctx, site.id, {
      text: "Panne fendue",
      kind: "PROBLEM",
      internal: false,
    });
    expect(note.internal).toBe(true);
    const notifications = await db.notification.findMany({ where: { type: "problem.reported" } });
    expect(notifications.map((n) => n.userId).sort()).toEqual([a.owner.id, office.user.id].sort());
  });

  it("creating a client is audited", async () => {
    const { a } = await setup();
    const client = await createClient(a.ownerCtx, clientSchema.parse({ name: "Mme Garcia" }));
    const log = await db.auditLog.findFirst({ where: { entityId: client.id, action: "client.create" } });
    expect(log?.actorId).toBe(a.owner.id);
  });
});
