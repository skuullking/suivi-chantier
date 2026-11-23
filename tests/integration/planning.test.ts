import { describe, expect, it } from "vitest";
import { parseDateOnly } from "@/lib/dates";
import { assignmentSchema } from "@/lib/validation/business";
import type { ServiceContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import {
  assignmentsOfDay,
  createAssignment,
  deleteAssignment,
  listAssignments,
  moveAssignment,
  planningMembers,
  updateAssignment,
} from "@/server/services/planning";
import { createSite } from "@/server/services/sites";
import { addMember, createOrganization } from "./helpers";

/** Same path as the planning form: raw input validated by the schema, then the service. */
const assign = (ctx: ServiceContext, raw: Record<string, unknown>) =>
  createAssignment(ctx, assignmentSchema.parse(raw));
const reassign = (ctx: ServiceContext, id: string, raw: Record<string, unknown>) =>
  updateAssignment(ctx, id, assignmentSchema.parse(raw));

const DAY = "2026-12-07";
const NEXT_DAY = "2026-12-08";

async function setup() {
  const a = await createOrganization("Charpentes A");
  const b = await createOrganization("Menuiserie B");
  const office = await addMember(a.organization.id, "OFFICE", "Bureau");
  const jean = await addMember(a.organization.id, "WORKER", "Jean");
  const lucas = await addMember(a.organization.id, "WORKER", "Lucas");
  const template = await db.stepTemplate.findFirstOrThrow({ where: { organizationId: a.organization.id } });
  const dupont = await createSite(a.ownerCtx, {
    newClient: { name: "M. Dupont" },
    info: { title: "Charpente Dupont", address: "8 chemin des Vignes" },
    templateId: template.id,
  });
  const martin = await createSite(a.ownerCtx, {
    newClient: { name: "Mme Martin" },
    info: { title: "Pergola Martin", address: "2 rue des Lilas" },
  });
  const foreignSite = await createSite(b.ownerCtx, {
    newClient: { name: "Client de B" },
    info: { title: "Chantier de B", address: "1 rue de B" },
  });
  const { assignment } = await assign(office.ctx, {
    siteId: dupont.id,
    userId: jean.user.id,
    date: DAY,
    slot: "FULL_DAY",
  });
  return { a, b, office, jean, lucas, dupont, martin, foreignSite, assignment };
}

describe("planning : déplacer une affectation (glisser-déposer)", () => {
  it("change le jour et la personne, et ajoute la personne à l'équipe du chantier", async () => {
    const { office, lucas, dupont, assignment } = await setup();
    const { warnings } = await moveAssignment(office.ctx, assignment.id, {
      date: NEXT_DAY,
      userId: lucas.user.id,
    });
    expect(warnings).toEqual([]);
    const moved = await db.assignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(moved.userId).toBe(lucas.user.id);
    expect(moved.date).toEqual(parseDateOnly(NEXT_DAY));
    const team = await db.siteMember.findMany({ where: { siteId: dupont.id } });
    expect(team.map((m) => m.userId)).toContain(lucas.user.id);
  });

  it("garde la personne si on ne déplace que le jour", async () => {
    const { office, jean, assignment } = await setup();
    await moveAssignment(office.ctx, assignment.id, { date: NEXT_DAY });
    const moved = await db.assignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(moved.userId).toBe(jean.user.id);
    expect(moved.date).toEqual(parseDateOnly(NEXT_DAY));
  });

  it("prévient d'un conflit sans bloquer le déplacement", async () => {
    const { office, jean, martin, assignment } = await setup();
    await assign(office.ctx, { siteId: martin.id, userId: jean.user.id, date: NEXT_DAY, slot: "MORNING" });
    const { warnings } = await moveAssignment(office.ctx, assignment.id, { date: NEXT_DAY });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Pergola Martin");
    expect((await db.assignment.findUniqueOrThrow({ where: { id: assignment.id } })).date).toEqual(
      parseDateOnly(NEXT_DAY),
    );
  });

  it("refuse les ouvriers, les membres d'une autre organisation et les affectations d'ailleurs", async () => {
    const { a, b, jean, assignment } = await setup();
    await expect(moveAssignment(jean.ctx, assignment.id, { date: NEXT_DAY })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      moveAssignment(a.ownerCtx, assignment.id, { date: NEXT_DAY, userId: b.owner.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(moveAssignment(b.ownerCtx, assignment.id, { date: NEXT_DAY })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect((await db.assignment.findUniqueOrThrow({ where: { id: assignment.id } })).date).toEqual(
      parseDateOnly(DAY),
    );
  });
});

describe("planning : modifier une affectation", () => {
  it("met à jour chantier, créneau, heure, étape et consignes", async () => {
    const { office, lucas, martin, assignment } = await setup();
    const step = await db.siteStep.create({
      data: { organizationId: martin.organizationId, siteId: martin.id, order: 1, title: "Pose" },
    });
    const { warnings } = await reassign(office.ctx, assignment.id, {
      siteId: martin.id,
      userId: lucas.user.id,
      date: NEXT_DAY,
      slot: "AFTERNOON",
      startTime: "13:30",
      stepId: step.id,
      instructions: "Prendre la nacelle",
    });
    expect(warnings).toEqual([]);
    const updated = await db.assignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(updated).toMatchObject({
      siteId: martin.id,
      userId: lucas.user.id,
      slot: "AFTERNOON",
      startTime: "13:30",
      stepId: step.id,
      instructions: "Prendre la nacelle",
    });
    const team = await db.siteMember.findMany({ where: { siteId: martin.id } });
    expect(team.map((m) => m.userId)).toContain(lucas.user.id);
  });

  it("refuse une étape d'un autre chantier et un chantier d'une autre organisation", async () => {
    const { office, jean, dupont, martin, foreignSite, assignment } = await setup();
    const dupontStep = await db.siteStep.findFirstOrThrow({ where: { siteId: dupont.id } });
    const base = { userId: jean.user.id, date: DAY, slot: "FULL_DAY" as const };
    await expect(
      reassign(office.ctx, assignment.id, { ...base, siteId: martin.id, stepId: dupontStep.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      reassign(office.ctx, assignment.id, { ...base, siteId: foreignSite.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect((await db.assignment.findUniqueOrThrow({ where: { id: assignment.id } })).siteId).toBe(dupont.id);
  });

  it("refuse un ouvrier", async () => {
    const { jean, dupont, assignment } = await setup();
    await expect(
      reassign(jean.ctx, assignment.id, {
        siteId: dupont.id,
        userId: jean.user.id,
        date: DAY,
        slot: "MORNING",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("planning : supprimer une affectation", () => {
  it("le bureau supprime, l'ouvrier et une autre organisation ne peuvent pas", async () => {
    const { b, office, jean, assignment } = await setup();
    await expect(deleteAssignment(jean.ctx, assignment.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteAssignment(b.ownerCtx, assignment.id)).rejects.toBeInstanceOf(NotFoundError);
    await deleteAssignment(office.ctx, assignment.id);
    expect(await db.assignment.count({ where: { id: assignment.id } })).toBe(0);
  });
});

describe("planning : lecture", () => {
  it("un ouvrier ne voit que sa journée, les responsables voient celle des autres", async () => {
    const { office, jean, lucas } = await setup();
    const day = parseDateOnly(DAY);
    expect(await assignmentsOfDay(jean.ctx, jean.user.id, day)).toHaveLength(1);
    expect(await assignmentsOfDay(lucas.ctx, jean.user.id, day)).toEqual([]);
    expect(await assignmentsOfDay(office.ctx, jean.user.id, day)).toHaveLength(1);
  });

  it("un ouvrier ne liste que ses affectations, même s'il filtre sur un autre", async () => {
    const { office, jean, lucas, martin } = await setup();
    await assign(office.ctx, { siteId: martin.id, userId: lucas.user.id, date: DAY, slot: "FULL_DAY" });
    const range = { from: parseDateOnly(DAY), to: parseDateOnly(DAY) };
    expect((await listAssignments(office.ctx, range)).length).toBe(2);
    const own = await listAssignments(jean.ctx, { ...range, userId: lucas.user.id });
    expect(own.map((x) => x.userId)).toEqual([jean.user.id]);
  });

  it("liste les membres de l'organisation seulement", async () => {
    const { a, b } = await setup();
    const members = await planningMembers(a.ownerCtx);
    expect(members).toHaveLength(4);
    expect(members.every((m) => m.organizationId === a.organization.id)).toBe(true);
    expect(members.map((m) => m.userId)).not.toContain(b.owner.id);
  });
});
