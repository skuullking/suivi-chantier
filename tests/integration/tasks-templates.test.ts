import { describe, expect, it } from "vitest";
import { parseDateOnly } from "@/lib/dates";
import { taskSchema } from "@/lib/validation/business";
import type { ServiceContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { createSite } from "@/server/services/sites";
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
} from "@/server/services/step-templates";
import { createTask, deleteTask, listSiteTasks, setTaskDone, tasksOfDay } from "@/server/services/tasks";
import { addMember, createOrganization } from "./helpers";

/** Same path as the form: raw input validated by the schema, then the service. */
const newTask = (ctx: ServiceContext, raw: Record<string, unknown>) => createTask(ctx, taskSchema.parse(raw));

async function setup() {
  const a = await createOrganization("Charpentes A");
  const b = await createOrganization("Menuiserie B");
  const office = await addMember(a.organization.id, "OFFICE", "Bureau");
  const worker = await addMember(a.organization.id, "WORKER", "Ouvrier");
  const outsider = await addMember(a.organization.id, "WORKER", "Pas affecté");
  const template = await db.stepTemplate.findFirstOrThrow({ where: { organizationId: a.organization.id } });
  const site = await createSite(a.ownerCtx, {
    newClient: { name: "M. Dupont" },
    info: { title: "Charpente Dupont", address: "8 chemin des Vignes" },
    templateId: template.id,
    memberIds: [worker.user.id],
  });
  const foreignSite = await createSite(b.ownerCtx, {
    newClient: { name: "Client de B" },
    info: { title: "Chantier de B", address: "1 rue de B" },
  });
  return { a, b, office, worker, outsider, site, foreignSite };
}

describe("tâches du jour", () => {
  it("le bureau crée une tâche datée, assignée et liée à une étape", async () => {
    const { office, worker, site } = await setup();
    const step = await db.siteStep.findFirstOrThrow({ where: { siteId: site.id } });
    const task = await newTask(office.ctx, {
      siteId: site.id,
      title: "Ramener l'échafaudage",
      date: "2026-12-01",
      assigneeId: worker.user.id,
      stepId: step.id,
    });
    expect(task).toMatchObject({ status: "TODO", assigneeId: worker.user.id, stepId: step.id });
    expect(task.date).toEqual(parseDateOnly("2026-12-01"));
    const list = await listSiteTasks(worker.ctx, site.id);
    expect(list.map((t) => t.id)).toEqual([task.id]);
    expect(list[0]!.assignee?.name).toBe(worker.user.name);
    expect(list[0]!.step?.title).toBe(step.title);
  });

  it("refuse un ouvrier comme créateur, un membre ou une étape d'ailleurs", async () => {
    const { a, b, worker, site, foreignSite } = await setup();
    await expect(newTask(worker.ctx, { siteId: site.id, title: "Tâche pirate" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      newTask(a.ownerCtx, { siteId: site.id, title: "Mauvais membre", assigneeId: b.owner.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const foreignStep = await db.siteStep.create({
      data: { organizationId: b.organization.id, siteId: foreignSite.id, order: 1, title: "Étape de B" },
    });
    await expect(
      newTask(a.ownerCtx, { siteId: site.id, title: "Mauvaise étape", stepId: foreignStep.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      newTask(a.ownerCtx, { siteId: foreignSite.id, title: "Chantier de B" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("l'ouvrier affecté coche et décoche, l'événement est journalisé une fois", async () => {
    const { a, worker, outsider, site } = await setup();
    const task = await newTask(a.ownerCtx, { siteId: site.id, title: "Balayer le chantier" });
    await setTaskDone(worker.ctx, task.id, true);
    const done = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(done).toMatchObject({ status: "DONE", completedById: worker.user.id });
    expect(done.completedAt).not.toBeNull();
    expect(await db.siteEvent.count({ where: { siteId: site.id, type: "task.done" } })).toBe(1);

    await setTaskDone(worker.ctx, task.id, false);
    const undone = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(undone).toMatchObject({ status: "TODO", completedAt: null, completedById: null });
    expect(await db.siteEvent.count({ where: { siteId: site.id, type: "task.done" } })).toBe(1);

    await expect(setTaskDone(outsider.ctx, task.id, true)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("une autre organisation ne coche ni ne supprime la tâche", async () => {
    const { a, b, site } = await setup();
    const task = await newTask(a.ownerCtx, { siteId: site.id, title: "Tâche de A" });
    await expect(setTaskDone(b.ownerCtx, task.id, true)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteTask(b.ownerCtx, task.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.task.count({ where: { id: task.id } })).toBe(1);
  });

  it("seuls les responsables suppriment une tâche", async () => {
    const { office, worker, site } = await setup();
    const task = await newTask(office.ctx, { siteId: site.id, title: "À supprimer" });
    await expect(deleteTask(worker.ctx, task.id)).rejects.toBeInstanceOf(ForbiddenError);
    await deleteTask(office.ctx, task.id);
    expect(await db.task.count({ where: { id: task.id } })).toBe(0);
  });

  it("la journée contient les tâches du jour et les tâches sans date encore ouvertes", async () => {
    const { a, b, site, foreignSite } = await setup();
    const day = parseDateOnly("2026-12-01");
    const dated = await newTask(a.ownerCtx, { siteId: site.id, title: "Le 1er", date: "2026-12-01" });
    await newTask(a.ownerCtx, { siteId: site.id, title: "Le 2", date: "2026-12-02" });
    const undated = await newTask(a.ownerCtx, { siteId: site.id, title: "Sans date" });
    const undatedDone = await newTask(a.ownerCtx, { siteId: site.id, title: "Sans date faite" });
    await setTaskDone(a.ownerCtx, undatedDone.id, true);
    await newTask(b.ownerCtx, { siteId: foreignSite.id, title: "Chez B", date: "2026-12-01" });

    const ids = (await tasksOfDay(a.ownerCtx, [site.id, foreignSite.id], day)).map((t) => t.id);
    expect(ids.sort()).toEqual([dated.id, undated.id].sort());
    expect(await tasksOfDay(a.ownerCtx, [], day)).toEqual([]);
  });
});

describe("éditeur de modèles d'étapes", () => {
  const input = {
    name: "Pergola bois",
    trade: "CARPENTER" as const,
    items: [
      { title: "Relevé", weight: 1, visibleToClient: true },
      { title: "Fabrication", weight: 3, visibleToClient: false },
      { title: "Pose", weight: 2, visibleToClient: true },
    ],
  };

  it("le patron crée, modifie et supprime un modèle, avec journal d'audit", async () => {
    const { a } = await setup();
    const created = await createTemplate(a.ownerCtx, input);
    const full = await getTemplate(a.ownerCtx, created.id);
    expect(full.items.map((i) => [i.order, i.title, i.weight, i.visibleToClient])).toEqual([
      [1, "Relevé", 1, true],
      [2, "Fabrication", 3, false],
      [3, "Pose", 2, true],
    ]);

    await updateTemplate(a.ownerCtx, created.id, {
      name: "Pergola alu",
      trade: "OTHER",
      items: [
        { title: "Pose", weight: 1, visibleToClient: true },
        { title: "Réception", weight: 1, visibleToClient: true },
      ],
    });
    const updated = await getTemplate(a.ownerCtx, created.id);
    expect(updated.name).toBe("Pergola alu");
    expect(updated.trade).toBe("OTHER");
    expect(updated.items.map((i) => i.title)).toEqual(["Pose", "Réception"]);
    expect(await db.stepTemplateItem.count({ where: { templateId: created.id } })).toBe(2);

    await deleteTemplate(a.ownerCtx, created.id);
    await expect(getTemplate(a.ownerCtx, created.id)).rejects.toBeInstanceOf(NotFoundError);
    const actions = (
      await db.auditLog.findMany({ where: { entityId: created.id }, orderBy: { createdAt: "asc" } })
    ).map((l) => l.action);
    expect(actions).toEqual(["template.create", "template.delete"]);
  });

  it("modifier un modèle ne change pas les chantiers déjà créés", async () => {
    const { a } = await setup();
    const template = await createTemplate(a.ownerCtx, input);
    const site = await createSite(a.ownerCtx, {
      newClient: { name: "Mme Martin" },
      info: { title: "Pergola Martin", address: "2 rue des Lilas" },
      templateId: template.id,
    });
    await updateTemplate(a.ownerCtx, template.id, {
      ...input,
      items: [{ title: "Tout nouveau", weight: 1, visibleToClient: true }],
    });
    await deleteTemplate(a.ownerCtx, template.id);
    const steps = await db.siteStep.findMany({ where: { siteId: site.id }, orderBy: { order: "asc" } });
    expect(steps.map((s) => s.title)).toEqual(["Relevé", "Fabrication", "Pose"]);
  });

  it("le bureau et les ouvriers lisent mais ne modifient pas les modèles", async () => {
    const { a, office, worker } = await setup();
    const template = await db.stepTemplate.findFirstOrThrow({ where: { organizationId: a.organization.id } });
    expect((await listTemplates(office.ctx)).length).toBe(5);
    for (const ctx of [office.ctx, worker.ctx]) {
      await expect(createTemplate(ctx, input)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(updateTemplate(ctx, template.id, input)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(deleteTemplate(ctx, template.id)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("les modèles d'une autre organisation sont invisibles", async () => {
    const { a, b } = await setup();
    const foreign = await db.stepTemplate.findFirstOrThrow({ where: { organizationId: b.organization.id } });
    expect((await listTemplates(a.ownerCtx)).every((t) => t.organizationId === a.organization.id)).toBe(true);
    await expect(getTemplate(a.ownerCtx, foreign.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateTemplate(a.ownerCtx, foreign.id, input)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteTemplate(a.ownerCtx, foreign.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.stepTemplateItem.count({ where: { templateId: foreign.id } })).toBeGreaterThan(0);
  });
});
