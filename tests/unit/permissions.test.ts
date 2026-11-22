import { describe, expect, it } from "vitest";
import { ACTIONS, can, type Action, type Actor, type MemberActor } from "@/server/permissions/can";

const ORG = "org_a";
const OTHER_ORG = "org_b";
const SITE = "site_1";

const owner: MemberActor = {
  kind: "member",
  userId: "u_owner",
  organizationId: ORG,
  role: "OWNER",
  officeCanValidatePhotos: true,
};
const office: MemberActor = { ...owner, userId: "u_office", role: "OFFICE" };
const officeNoValidation: MemberActor = { ...office, officeCanValidatePhotos: false };
const worker: MemberActor = { ...owner, userId: "u_worker", role: "WORKER" };
const client: Actor = { kind: "client", organizationId: ORG, siteId: SITE };

const assignedSite = { organizationId: ORG, siteId: SITE, assignedUserIds: [worker.userId] };
const unassignedSite = { organizationId: ORG, siteId: SITE, assignedUserIds: ["someone_else"] };

/**
 * Full matrix (cahier des charges §4). Values: true/false for the reference resource of each row.
 * The resource is the worker's ASSIGNED site when relevant; dedicated tests cover unassigned cases.
 */
type Row = {
  action: Action;
  resource?: Parameters<typeof can>[2];
  clientResource?: Parameters<typeof can>[2];
  expected: { OWNER: boolean; OFFICE: boolean; WORKER: boolean; CLIENT: boolean };
};

const MATRIX: Row[] = [
  { action: "organization.manage", expected: { OWNER: true, OFFICE: false, WORKER: false, CLIENT: false } },
  { action: "billing.manage", expected: { OWNER: true, OFFICE: false, WORKER: false, CLIENT: false } },
  { action: "members.manage", expected: { OWNER: true, OFFICE: false, WORKER: false, CLIENT: false } },
  { action: "audit.view", expected: { OWNER: true, OFFICE: false, WORKER: false, CLIENT: false } },
  { action: "data.export", expected: { OWNER: true, OFFICE: false, WORKER: false, CLIENT: false } },
  { action: "organization.delete", expected: { OWNER: true, OFFICE: false, WORKER: false, CLIENT: false } },
  { action: "client.create", expected: { OWNER: true, OFFICE: true, WORKER: false, CLIENT: false } },
  { action: "client.update", expected: { OWNER: true, OFFICE: true, WORKER: false, CLIENT: false } },
  { action: "client.view", expected: { OWNER: true, OFFICE: true, WORKER: false, CLIENT: false } },
  { action: "client.viewLimited", expected: { OWNER: true, OFFICE: true, WORKER: true, CLIENT: false } },
  { action: "site.create", expected: { OWNER: true, OFFICE: true, WORKER: false, CLIENT: false } },
  { action: "site.list", expected: { OWNER: true, OFFICE: true, WORKER: true, CLIENT: false } },
  {
    action: "site.update",
    resource: assignedSite,
    expected: { OWNER: true, OFFICE: true, WORKER: false, CLIENT: false },
  },
  {
    action: "site.delete",
    resource: assignedSite,
    expected: { OWNER: true, OFFICE: true, WORKER: false, CLIENT: false },
  },
  {
    action: "site.view",
    resource: assignedSite,
    clientResource: { organizationId: ORG, siteId: SITE },
    expected: { OWNER: true, OFFICE: true, WORKER: true, CLIENT: true },
  },
  {
    action: "step.update",
    resource: assignedSite,
    expected: { OWNER: true, OFFICE: true, WORKER: false, CLIENT: false },
  },
  {
    action: "step.complete",
    resource: assignedSite,
    expected: { OWNER: true, OFFICE: true, WORKER: true, CLIENT: false },
  },
  {
    action: "note.create",
    resource: assignedSite,
    expected: { OWNER: true, OFFICE: true, WORKER: true, CLIENT: false },
  },
  {
    action: "document.create",
    resource: { ...assignedSite, documentType: "EXPENSE" },
    expected: { OWNER: true, OFFICE: true, WORKER: true, CLIENT: false },
  },
  {
    action: "document.create",
    resource: { ...assignedSite, documentType: "PURCHASE_ORDER" },
    expected: { OWNER: true, OFFICE: true, WORKER: true, CLIENT: false },
  },
  {
    action: "document.create",
    resource: { ...assignedSite, documentType: "INVOICE" },
    expected: { OWNER: true, OFFICE: true, WORKER: false, CLIENT: false },
  },
  {
    action: "document.view",
    resource: { ...assignedSite, documentType: "PLAN", documentVisibleToClient: false },
    clientResource: {
      organizationId: ORG,
      siteId: SITE,
      documentType: "PLAN",
      documentVisibleToClient: false,
    },
    expected: { OWNER: true, OFFICE: true, WORKER: true, CLIENT: false },
  },
  {
    action: "document.view",
    resource: { ...assignedSite, documentType: "INVOICE", documentVisibleToClient: true },
    clientResource: {
      organizationId: ORG,
      siteId: SITE,
      documentType: "INVOICE",
      documentVisibleToClient: true,
    },
    expected: { OWNER: true, OFFICE: true, WORKER: false, CLIENT: true },
  },
  { action: "document.update", expected: { OWNER: true, OFFICE: true, WORKER: false, CLIENT: false } },
  { action: "document.delete", expected: { OWNER: true, OFFICE: true, WORKER: false, CLIENT: false } },
  { action: "planning.update", expected: { OWNER: true, OFFICE: true, WORKER: false, CLIENT: false } },
  {
    action: "planning.view",
    resource: { organizationId: ORG, ownerUserId: worker.userId },
    clientResource: { organizationId: ORG, siteId: SITE },
    expected: { OWNER: true, OFFICE: true, WORKER: true, CLIENT: true },
  },
  { action: "task.manage", expected: { OWNER: true, OFFICE: true, WORKER: false, CLIENT: false } },
  {
    action: "task.complete",
    resource: assignedSite,
    expected: { OWNER: true, OFFICE: true, WORKER: true, CLIENT: false },
  },
  {
    action: "media.upload",
    resource: assignedSite,
    expected: { OWNER: true, OFFICE: true, WORKER: true, CLIENT: false },
  },
  {
    action: "media.view",
    resource: assignedSite,
    clientResource: { organizationId: ORG, siteId: SITE },
    expected: { OWNER: true, OFFICE: true, WORKER: true, CLIENT: true },
  },
  { action: "media.validate", expected: { OWNER: true, OFFICE: true, WORKER: false, CLIENT: false } },
  {
    action: "summary.view",
    resource: assignedSite,
    clientResource: { organizationId: ORG, siteId: SITE },
    expected: { OWNER: true, OFFICE: true, WORKER: false, CLIENT: true },
  },
  { action: "summary.approve", expected: { OWNER: true, OFFICE: true, WORKER: false, CLIENT: false } },
  { action: "inbox.process", expected: { OWNER: true, OFFICE: true, WORKER: false, CLIENT: false } },
  { action: "portal.manage", expected: { OWNER: true, OFFICE: true, WORKER: false, CLIENT: false } },
  {
    action: "portal.view",
    clientResource: { organizationId: ORG, siteId: SITE },
    expected: { OWNER: false, OFFICE: false, WORKER: false, CLIENT: true },
  },
];

describe("permissions matrix", () => {
  it.each(MATRIX)("$action", ({ action, resource, clientResource, expected }) => {
    expect(can(owner, action, resource)).toBe(expected.OWNER);
    expect(can(office, action, resource)).toBe(expected.OFFICE);
    expect(can(worker, action, resource)).toBe(expected.WORKER);
    expect(can(client, action, clientResource ?? resource)).toBe(expected.CLIENT);
  });

  it("covers every declared action", () => {
    const covered = new Set(MATRIX.map((r) => r.action));
    expect(ACTIONS.filter((a) => !covered.has(a))).toEqual([]);
  });
});

describe("multi-tenancy", () => {
  it.each(ACTIONS)("nobody can %s on another organization", (action) => {
    const foreign = { organizationId: OTHER_ORG, siteId: SITE, assignedUserIds: [worker.userId] };
    for (const actor of [owner, office, worker, client]) {
      expect(can(actor, action, foreign)).toBe(false);
    }
  });
});

describe("worker scope", () => {
  it("cannot view, complete steps or upload on a site he is not assigned to", () => {
    expect(can(worker, "site.view", unassignedSite)).toBe(false);
    expect(can(worker, "step.complete", unassignedSite)).toBe(false);
    expect(can(worker, "media.upload", unassignedSite)).toBe(false);
    expect(can(worker, "media.view", unassignedSite)).toBe(false);
    expect(can(worker, "document.view", { ...unassignedSite, documentType: "PLAN" })).toBe(false);
  });

  it("needs an explicit assignment list to view a site", () => {
    expect(can(worker, "site.view", { organizationId: ORG, siteId: SITE })).toBe(false);
  });

  it("only sees his own planning", () => {
    expect(can(worker, "planning.view", { organizationId: ORG, ownerUserId: "other" })).toBe(false);
  });

  it("can upload media without site context (auto-attachment later)", () => {
    expect(can(worker, "media.upload", { organizationId: ORG })).toBe(true);
  });
});

describe("office settings", () => {
  it("office photo validation depends on the organization setting", () => {
    expect(can(office, "media.validate")).toBe(true);
    expect(can(officeNoValidation, "media.validate")).toBe(false);
  });
});

describe("client portal scope", () => {
  it("cannot access another site of the same organization", () => {
    expect(can(client, "site.view", { organizationId: ORG, siteId: "site_2" })).toBe(false);
    expect(can(client, "media.view", { organizationId: ORG, siteId: "site_2" })).toBe(false);
  });

  it("only sees documents explicitly marked visible", () => {
    expect(
      can(client, "document.view", { organizationId: ORG, siteId: SITE, documentVisibleToClient: false }),
    ).toBe(false);
  });
});
