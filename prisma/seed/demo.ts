import { randomUUID } from "node:crypto";
import type { DocumentType, MediaSource, StepStatus, ValidationStatus } from "@/generated/prisma/enums";
import { addDays, startOfWeek, today } from "@/lib/dates";
import { storage } from "@/server/adapters/storage";
import { hashPassword } from "@/server/auth/password";
import { hashToken, sha256Hex } from "@/server/auth/tokens";
import { db } from "@/server/db";
import { DEFAULT_STEP_TEMPLATES } from "@/server/domain/step-templates";
import { computeProgress } from "@/server/domain/progress";
import { seedStepTemplates } from "@/server/services/organizations";
import { demoPdf, demoPhoto } from "./assets";

export const DEMO_PASSWORD = "chantier-demo";
export const DEMO_SLUG = "charpentes-martin";
/** Fixed demo token for the client portal of the Dupont site (demo only: real tokens are random). */
export const DEMO_PORTAL_TOKEN = "demo-dupont-suivi-chantier-0123456789abcdefABCDEF";

export const DEMO_USERS = {
  owner: { email: "patron@demo.chantierlink.fr", name: "Paul Martin", phone: "+33611223344", role: "OWNER" },
  office: {
    email: "bureau@demo.chantierlink.fr",
    name: "Sophie Martin",
    phone: "+33622334455",
    role: "OFFICE",
  },
  worker1: {
    email: "jean@demo.chantierlink.fr",
    name: "Jean Lefèvre",
    phone: "+33633445566",
    role: "WORKER",
  },
  worker2: {
    email: "lucas@demo.chantierlink.fr",
    name: "Lucas Moreau",
    phone: "+33644556677",
    role: "WORKER",
  },
} as const;

/** Removes the demo organization (and its files) if it exists. */
export async function deleteDemo() {
  const existing = await db.organization.findUnique({ where: { slug: DEMO_SLUG } });
  if (existing) {
    await storage()
      .deletePrefix(`org/${existing.id}/`)
      .catch(() => {});
    await db.organization.delete({ where: { id: existing.id } });
  }
  await db.user.deleteMany({ where: { email: { in: Object.values(DEMO_USERS).map((u) => u.email) } } });
}

const at = (day: Date, hour: number, minute = 0) =>
  new Date(day.getTime() + (hour - 1) * 3600_000 + minute * 60_000);

export async function seedDemo() {
  await deleteDemo();
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const now = today("Europe/Paris");
  const monday = startOfWeek(now);

  const organization = await db.organization.create({
    data: {
      name: "Charpentes Martin",
      slug: DEMO_SLUG,
      trade: "CARPENTER",
      email: "contact@charpentes-martin.fr",
      phone: "+33561000000",
      address: "12 route de l'Atelier, 31000 Toulouse",
      plan: "TEAM",
      subscriptionStatus: "TRIALING",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      onboardingDismissed: true,
      subscription: { create: { plan: "TEAM", status: "TRIALING", provider: "none" } },
    },
  });
  const orgId = organization.id;
  await seedStepTemplates(db, orgId);

  const users = {} as Record<keyof typeof DEMO_USERS, { id: string; name: string }>;
  for (const [key, u] of Object.entries(DEMO_USERS) as [
    keyof typeof DEMO_USERS,
    (typeof DEMO_USERS)[keyof typeof DEMO_USERS],
  ][]) {
    const user = await db.user.create({
      data: { email: u.email, name: u.name, phone: u.phone, passwordHash },
    });
    await db.membership.create({ data: { userId: user.id, organizationId: orgId, role: u.role } });
    users[key] = user;
  }
  for (const key of ["worker1", "worker2", "owner"] as const) {
    await db.whatsAppContact.create({
      data: {
        organizationId: orgId,
        phoneE164: DEMO_USERS[key].phone,
        userId: users[key].id,
        label: users[key].name,
      },
    });
  }

  // ───────── Clients ─────────
  const dupont = await db.client.create({
    data: {
      organizationId: orgId,
      name: "M. et Mme Dupont",
      emails: ["famille.dupont@exemple.fr"],
      phones: ["06 12 34 56 78"],
      addresses: ["8 chemin des Vignes, 31320 Castanet-Tolosan"],
      tags: ["parrainage"],
      consentCommunications: true,
      notes: "Préfèrent être contactés par SMS en journée.",
    },
  });
  const garcia = await db.client.create({
    data: {
      organizationId: orgId,
      name: "Isabelle Garcia",
      emails: ["i.garcia@exemple.fr"],
      phones: ["06 98 76 54 32"],
      addresses: ["27 rue des Lilas, 31130 Balma"],
      consentCommunications: true,
    },
  });
  const tilleuls = await db.client.create({
    data: {
      organizationId: orgId,
      type: "PROFESSIONAL",
      name: "Marc Roux",
      companyName: "SCI Les Tilleuls",
      emails: ["gestion@sci-tilleuls.fr"],
      phones: ["05 61 22 33 44"],
      addresses: ["3 place du Marché, 31600 Muret"],
      tags: ["professionnel"],
      consentCommunications: true,
    },
  });
  const bernard = await db.client.create({
    data: {
      organizationId: orgId,
      name: "Claire Bernard",
      emails: ["claire.bernard@exemple.fr"],
      phones: ["07 11 22 33 44"],
      addresses: ["14 allée des Chênes, 31650 Saint-Orens"],
      tags: ["prospect"],
      notes: "Devis carport envoyé, à relancer.",
    },
  });

  // ───────── Sites ─────────
  const carpentry = DEFAULT_STEP_TEMPLATES.find((t) => t.trade === "CARPENTER")!.steps;

  async function createSite(input: {
    code: string;
    clientId: string;
    title: string;
    address: string;
    postalCode: string;
    city: string;
    latitude: number;
    longitude: number;
    status: "PLANNED" | "IN_PROGRESS" | "COMPLETED";
    plannedStart: Date;
    plannedEnd: Date;
    actualStart?: Date;
    actualEnd?: Date;
    description: string;
    instructions: string;
    stepStatuses: StepStatus[];
    stepDates: { start: Date; end: Date }[];
    members: string[];
  }) {
    const steps = carpentry.map((title, i) => ({
      organizationId: orgId,
      title,
      order: i + 1,
      status: input.stepStatuses[i] ?? "TODO",
      weight: title === "Pose charpente" || title === "Couverture" ? 2 : 1,
      visibleToClient: title !== "Plans / commande des bois",
      plannedStart: input.stepDates[i]?.start,
      plannedEnd: input.stepDates[i]?.end,
      startedAt:
        input.stepStatuses[i] && input.stepStatuses[i] !== "TODO" ? at(input.stepDates[i]!.start, 8) : null,
      completedAt: input.stepStatuses[i] === "DONE" ? at(input.stepDates[i]!.end, 17) : null,
    }));
    return db.site.create({
      data: {
        organizationId: orgId,
        clientId: input.clientId,
        code: input.code,
        title: input.title,
        address: input.address,
        postalCode: input.postalCode,
        city: input.city,
        latitude: input.latitude,
        longitude: input.longitude,
        status: input.status,
        plannedStart: input.plannedStart,
        plannedEnd: input.plannedEnd,
        actualStart: input.actualStart,
        actualEnd: input.actualEnd,
        description: input.description,
        instructions: input.instructions,
        progress: computeProgress(steps.map((s, i) => ({ ...s, id: String(i) }))),
        steps: { create: steps },
        members: { create: input.members.map((userId) => ({ organizationId: orgId, userId })) },
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });
  }

  const dates = (start: Date, lengths: number[]) => {
    let cursor = start;
    return lengths.map((len) => {
      const s = cursor;
      const e = addDays(cursor, len - 1);
      cursor = addDays(e, 1);
      return { start: s, end: e };
    });
  };

  // 1. In progress, one step late.
  const dupontStart = addDays(now, -24);
  const dupontDates = dates(dupontStart, [2, 5, 6, 1, 10, 6, 3, 2]);
  const siteDupont = await createSite({
    code: "DUP-1",
    clientId: dupont.id,
    title: "Charpente maison Dupont",
    address: "8 chemin des Vignes",
    postalCode: "31320",
    city: "Castanet-Tolosan",
    latitude: 43.5164,
    longitude: 1.4986,
    status: "IN_PROGRESS",
    plannedStart: dupontStart,
    plannedEnd: addDays(now, 10),
    actualStart: dupontStart,
    description: "Charpente traditionnelle en douglas, 140 m², deux pans, débord de toit 50 cm.",
    instructions: "Portail : code 1984. Se garer devant le garage. Les propriétaires ont un chien (gentil).",
    stepStatuses: ["DONE", "DONE", "DONE", "DONE", "IN_PROGRESS", "TODO", "TODO", "TODO"],
    stepDates: dupontDates.map((d, i) => (i === 4 ? { start: d.start, end: addDays(now, -1) } : d)),
    members: [users.worker1.id, users.worker2.id],
  });

  // 2. Planned next week.
  const garciaStart = addDays(monday, 7);
  const siteGarcia = await createSite({
    code: "GAR-2",
    clientId: garcia.id,
    title: "Extension ossature bois Garcia",
    address: "27 rue des Lilas",
    postalCode: "31130",
    city: "Balma",
    latitude: 43.6107,
    longitude: 1.4996,
    status: "PLANNED",
    plannedStart: garciaStart,
    plannedEnd: addDays(garciaStart, 34),
    description: "Extension de 25 m² en ossature bois avec toiture monopente.",
    instructions: "Accès par le jardin à l'arrière. Prévoir des bâches pour la terrasse.",
    stepStatuses: [],
    stepDates: dates(garciaStart, [1, 4, 5, 1, 8, 5, 3, 2]),
    members: [users.worker1.id],
  });

  // 3. Completed last month.
  const tilleulsStart = addDays(now, -70);
  const tilleulsDates = dates(tilleulsStart, [1, 4, 5, 1, 9, 6, 3, 1]);
  const siteTilleuls = await createSite({
    code: "ROU-3",
    clientId: tilleuls.id,
    title: "Rénovation toiture SCI Les Tilleuls",
    address: "3 place du Marché",
    postalCode: "31600",
    city: "Muret",
    latitude: 43.4614,
    longitude: 1.3264,
    status: "COMPLETED",
    plannedStart: tilleulsStart,
    plannedEnd: tilleulsDates.at(-1)!.end,
    actualStart: tilleulsStart,
    actualEnd: tilleulsDates.at(-1)!.end,
    description: "Reprise complète de la charpente et de la couverture d'un immeuble de rapport.",
    instructions: "Clés à récupérer à l'agence. Échafaudage côté rue.",
    stepStatuses: Array(8).fill("DONE") as StepStatus[],
    stepDates: tilleulsDates,
    members: [users.worker2.id],
  });
  await db.organization.update({ where: { id: orgId }, data: { siteCounter: 3 } });

  // ───────── Photos (generated) ─────────
  async function addPhoto(input: {
    siteId: string;
    stepId: string;
    authorId: string;
    caption: string;
    day: Date;
    hour: number;
    variant: number;
    progress: number;
    status: ValidationStatus;
    source?: MediaSource;
  }) {
    const img = await demoPhoto(input.caption, input.variant, input.progress);
    const base = `org/${orgId}/media/${randomUUID()}`;
    await storage().put(`${base}/original.jpg`, img.original, "image/jpeg");
    await storage().put(`${base}/thumb.jpg`, img.thumbnail, "image/jpeg");
    const time = at(input.day, input.hour, 15);
    await db.media.create({
      data: {
        organizationId: orgId,
        siteId: input.siteId,
        stepId: input.stepId,
        authorId: input.authorId,
        kind: "PHOTO",
        source: input.source ?? "APP",
        storageKey: `${base}/original.jpg`,
        thumbnailKey: `${base}/thumb.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: img.original.byteLength,
        originalName: "photo.jpg",
        width: img.width,
        height: img.height,
        capturedAt: time,
        receivedAt: new Date(time.getTime() + 20_000),
        validationStatus: input.status,
        validatedById: input.status === "PENDING" ? null : users.owner.id,
        validatedAt: input.status === "PENDING" ? null : new Date(time.getTime() + 3 * 3600_000),
        caption: input.caption,
        processingStatus: "DONE",
      },
    });
  }

  const ds = siteDupont.steps;
  const dupontPhotos: [number, string, number, ValidationStatus][] = [
    [0, "Prise de côtes du mur porteur", 0.1, "APPROVED"],
    [2, "Taille des fermes à l'atelier", 0.3, "APPROVED"],
    [3, "Livraison du bois sur le chantier", 0.35, "APPROVED"],
    [4, "Pose des premières fermes", 0.5, "APPROVED"],
    [4, "Fermes posées côté sud", 0.7, "APPROVED"],
  ];
  for (const [i, [stepIndex, caption, progress, status]] of dupontPhotos.entries()) {
    const step = ds[stepIndex]!;
    await addPhoto({
      siteId: siteDupont.id,
      stepId: step.id,
      authorId: i % 2 ? users.worker2.id : users.worker1.id,
      caption,
      day: stepIndex === 4 ? addDays(now, i - 6) : step.plannedEnd!,
      hour: 10 + i,
      variant: i,
      progress,
      status,
    });
  }
  // Two photos of today, waiting for validation.
  await addPhoto({
    siteId: siteDupont.id,
    stepId: ds[4]!.id,
    authorId: users.worker1.id,
    caption: "Contreventement en cours",
    day: now,
    hour: 10,
    variant: 2,
    progress: 0.85,
    status: "PENDING",
  });
  await addPhoto({
    siteId: siteDupont.id,
    stepId: ds[4]!.id,
    authorId: users.worker2.id,
    caption: "Faîtage posé",
    day: now,
    hour: 15,
    variant: 3,
    progress: 0.9,
    status: "PENDING",
    source: "WHATSAPP",
  });
  for (const [i, step] of siteTilleuls.steps.entries()) {
    if (i % 2 === 1) continue;
    await addPhoto({
      siteId: siteTilleuls.id,
      stepId: step.id,
      authorId: users.worker2.id,
      caption: step.title,
      day: step.plannedEnd!,
      hour: 16,
      variant: i,
      progress: 0.2 + i * 0.1,
      status: "APPROVED",
    });
  }

  // ───────── Documents (generated PDFs) ─────────
  async function addDocument(input: {
    siteId?: string;
    clientId: string;
    type: DocumentType;
    name: string;
    pdf: Buffer;
    date: Date;
    amountCents?: number;
    supplier?: string;
    visibleToClient?: boolean;
    ocrText: string;
  }) {
    const key = `org/${orgId}/documents/${randomUUID()}.pdf`;
    await storage().put(key, input.pdf, "application/pdf");
    await db.document.create({
      data: {
        organizationId: orgId,
        siteId: input.siteId,
        clientId: input.clientId,
        type: input.type,
        name: input.name,
        storageKey: key,
        mimeType: "application/pdf",
        sizeBytes: input.pdf.byteLength,
        originalName: `${input.name}.pdf`,
        sha256: sha256Hex(input.pdf),
        documentDate: input.date,
        amountCents: input.amountCents,
        supplier: input.supplier,
        visibleToClient: input.visibleToClient ?? false,
        source: "UPLOAD",
        processingStatus: "DONE",
        classificationConfidence: 1,
        ocrText: input.ocrText,
        uploadedById: users.office.id,
      },
    });
  }

  const quoteLines = [
    { label: "Fourniture douglas classe 2, 9,5 m³", amount: 6840 },
    { label: "Taille et assemblage en atelier", amount: 3200 },
    { label: "Pose de la charpente (2 compagnons, 8 jours)", amount: 5120 },
    { label: "Traitement fongicide et insecticide", amount: 640 },
  ];
  await addDocument({
    siteId: siteDupont.id,
    clientId: dupont.id,
    type: "QUOTE",
    name: "Devis D-2026-041 charpente Dupont",
    pdf: await demoPdf({
      title: "Devis D-2026-041 — Charpente traditionnelle",
      company: "Charpentes Martin",
      lines: [
        "Client : M. et Mme Dupont",
        "8 chemin des Vignes, 31320 Castanet-Tolosan",
        "Validité : 3 mois",
      ],
      table: quoteLines,
    }),
    date: addDays(now, -45),
    amountCents: 1_580_000,
    supplier: "Charpentes Martin",
    visibleToClient: true,
    ocrText: "Devis charpente traditionnelle douglas Dupont Castanet-Tolosan total 15 800,00 €",
  });
  await addDocument({
    siteId: siteDupont.id,
    clientId: dupont.id,
    type: "INVOICE",
    name: "Facture d'acompte F-2026-112",
    pdf: await demoPdf({
      title: "Facture d'acompte F-2026-112 (30 %)",
      company: "Charpentes Martin",
      lines: ["Client : M. et Mme Dupont", "Acompte sur devis D-2026-041"],
      table: [{ label: "Acompte 30 %", amount: 4740 }],
    }),
    date: addDays(now, -30),
    amountCents: 474_000,
    supplier: "Charpentes Martin",
    visibleToClient: true,
    ocrText: "Facture acompte 30% devis D-2026-041 Dupont 4 740,00 €",
  });
  await addDocument({
    siteId: siteDupont.id,
    clientId: dupont.id,
    type: "PLAN",
    name: "Plan de charpente Dupont (indice B)",
    pdf: await demoPdf({
      title: "Plan de charpente — indice B",
      company: "Charpentes Martin",
      lines: [
        "Fermes à entrait retroussé, entraxe 90 cm",
        "Pente 35°, faîtage à 7,20 m",
        "Pannes 75×225 douglas",
      ],
    }),
    date: addDays(now, -40),
    ocrText: "Plan charpente fermes entrait retroussé pente 35 degrés pannes douglas",
  });
  await addDocument({
    siteId: siteDupont.id,
    clientId: dupont.id,
    type: "PURCHASE_ORDER",
    name: "Bon de commande Scierie du Comminges",
    pdf: await demoPdf({
      title: "Bon de commande BC-7781",
      company: "Scierie du Comminges",
      lines: ["Livraison : chantier Dupont, Castanet-Tolosan"],
      table: [{ label: "Douglas classe 2 — 9,5 m³", amount: 5130 }],
    }),
    date: addDays(now, -28),
    amountCents: 513_000,
    supplier: "Scierie du Comminges",
    ocrText: "Bon de commande Scierie du Comminges douglas 9,5 m3 chantier Dupont 5 130,00 €",
  });
  await addDocument({
    siteId: siteGarcia.id,
    clientId: garcia.id,
    type: "QUOTE",
    name: "Devis D-2026-052 extension Garcia",
    pdf: await demoPdf({
      title: "Devis D-2026-052 — Extension ossature bois",
      company: "Charpentes Martin",
      lines: ["Client : Isabelle Garcia", "27 rue des Lilas, 31130 Balma"],
      table: [
        { label: "Ossature bois et isolation", amount: 18_400 },
        { label: "Toiture monopente bac acier", amount: 6_200 },
      ],
    }),
    date: addDays(now, -12),
    amountCents: 2_460_000,
    supplier: "Charpentes Martin",
    visibleToClient: true,
    ocrText: "Devis extension ossature bois Garcia Balma toiture monopente 24 600,00 €",
  });
  await addDocument({
    siteId: siteTilleuls.id,
    clientId: tilleuls.id,
    type: "INVOICE",
    name: "Facture F-2026-098 SCI Les Tilleuls",
    pdf: await demoPdf({
      title: "Facture F-2026-098 — Solde",
      company: "Charpentes Martin",
      lines: ["Client : SCI Les Tilleuls", "Rénovation toiture, 3 place du Marché, Muret"],
      table: [{ label: "Solde des travaux", amount: 21_350 }],
    }),
    date: addDays(now, -20),
    amountCents: 2_135_000,
    supplier: "Charpentes Martin",
    visibleToClient: true,
    ocrText: "Facture solde rénovation toiture SCI Les Tilleuls Muret 21 350,00 €",
  });
  await addDocument({
    clientId: bernard.id,
    type: "QUOTE",
    name: "Devis D-2026-057 carport Bernard",
    pdf: await demoPdf({
      title: "Devis D-2026-057 — Carport 2 places",
      company: "Charpentes Martin",
      lines: ["Client : Claire Bernard", "14 allée des Chênes, 31650 Saint-Orens"],
      table: [{ label: "Carport douglas 6 × 5 m, couverture bac acier", amount: 7_900 }],
    }),
    date: addDays(now, -5),
    amountCents: 790_000,
    supplier: "Charpentes Martin",
    ocrText: "Devis carport deux places douglas Bernard Saint-Orens 7 900,00 €",
  });

  // ───────── Planning of the week ─────────
  const assignments: { userId: string; siteId: string; date: Date; startTime: string; stepId?: string }[] =
    [];
  for (let d = 0; d < 5; d++) {
    const date = addDays(monday, d);
    assignments.push({
      userId: users.worker1.id,
      siteId: siteDupont.id,
      date,
      startTime: "08:00",
      stepId: ds[4]!.id,
    });
    if (d !== 2) {
      assignments.push({
        userId: users.worker2.id,
        siteId: siteDupont.id,
        date,
        startTime: "08:00",
        stepId: ds[4]!.id,
      });
    }
  }
  assignments.push({
    userId: users.owner.id,
    siteId: siteDupont.id,
    date: addDays(monday, 2),
    startTime: "14:00",
  });
  for (let d = 0; d < 3; d++) {
    assignments.push({
      userId: users.worker1.id,
      siteId: siteGarcia.id,
      date: addDays(garciaStart, d),
      startTime: "08:00",
      stepId: siteGarcia.steps[0]!.id,
    });
  }
  // Tomorrow (for the day-before reminder), even on weekends.
  const tomorrow = addDays(now, 1);
  if (!assignments.some((a) => a.userId === users.worker2.id && a.date.getTime() === tomorrow.getTime())) {
    assignments.push({ userId: users.worker2.id, siteId: siteDupont.id, date: tomorrow, startTime: "08:00" });
  }
  if (!assignments.some((a) => a.userId === users.worker1.id && a.date.getTime() === now.getTime())) {
    assignments.push({
      userId: users.worker1.id,
      siteId: siteDupont.id,
      date: now,
      startTime: "08:00",
      stepId: ds[4]!.id,
    });
  }
  await db.assignment.createMany({
    data: assignments.map((a) => ({ organizationId: orgId, slot: "FULL_DAY", ...a })),
  });

  // ───────── Tasks, notes, journal ─────────
  await db.task.createMany({
    data: [
      {
        organizationId: orgId,
        siteId: siteDupont.id,
        title: "Poser le contreventement",
        date: now,
        stepId: ds[4]!.id,
      },
      { organizationId: orgId, siteId: siteDupont.id, title: "Vérifier l'aplomb des fermes", date: now },
      {
        organizationId: orgId,
        siteId: siteDupont.id,
        title: "Commander les liteaux",
        assigneeId: users.office.id,
      },
      {
        organizationId: orgId,
        siteId: siteGarcia.id,
        title: "Confirmer la livraison du bois",
        assigneeId: users.office.id,
      },
    ],
  });
  await db.note.createMany({
    data: [
      {
        organizationId: orgId,
        siteId: siteDupont.id,
        authorId: users.worker1.id,
        kind: "NOTE",
        text: "Livraison du bois conforme, stockée sous bâche côté garage.",
        internal: true,
        createdAt: at(dupontDates[3]!.end, 11),
      },
      {
        organizationId: orgId,
        siteId: siteDupont.id,
        authorId: users.worker2.id,
        kind: "PROBLEM",
        text: "Une panne est fendue sur 40 cm, à remplacer avant la couverture.",
        internal: true,
        createdAt: at(addDays(now, -2), 16),
      },
    ],
  });
  await db.dailySummary.create({
    data: {
      organizationId: orgId,
      siteId: siteDupont.id,
      date: addDays(now, -1),
      generatedText:
        "Belle journée sur votre chantier : l'équipe a terminé la pose des fermes côté sud. La charpente prend forme et la suite est prévue dès demain avec le contreventement.",
      status: "SENT",
      approvedById: users.owner.id,
      approvedAt: at(addDays(now, -1), 18, 30),
      sentAt: at(addDays(now, -1), 18, 31),
    },
  });
  const eventsData = [
    {
      siteId: siteDupont.id,
      actorId: users.office.id,
      type: "site.created",
      createdAt: at(addDays(now, -46), 9),
    },
    {
      siteId: siteDupont.id,
      actorId: users.worker1.id,
      type: "step.status",
      payload: { title: "Livraison", status: "DONE", label: "Terminée" },
      createdAt: at(dupontDates[3]!.end, 17),
    },
    {
      siteId: siteDupont.id,
      actorId: users.worker2.id,
      type: "problem.reported",
      createdAt: at(addDays(now, -2), 16),
    },
    {
      siteId: siteDupont.id,
      actorId: users.worker1.id,
      type: "media.added",
      payload: { kind: "PHOTO" },
      createdAt: at(now, 10),
    },
    {
      siteId: siteGarcia.id,
      actorId: users.office.id,
      type: "site.created",
      createdAt: at(addDays(now, -12), 10),
    },
    {
      siteId: siteTilleuls.id,
      actorId: users.owner.id,
      type: "site.status",
      payload: { status: "COMPLETED", label: "Terminé" },
      createdAt: at(tilleulsDates.at(-1)!.end, 18),
    },
  ];
  await db.siteEvent.createMany({ data: eventsData.map((e) => ({ organizationId: orgId, ...e })) });

  // ───────── Client portal link (Dupont) ─────────
  await db.clientPortalLink.create({
    data: {
      organizationId: orgId,
      siteId: siteDupont.id,
      tokenHash: hashToken(DEMO_PORTAL_TOKEN),
      createdById: users.owner.id,
    },
  });

  // ───────── Notifications ─────────
  await db.notification.createMany({
    data: [
      {
        organizationId: orgId,
        userId: users.owner.id,
        type: "photos.pending",
        title: "2 photos à valider",
        body: "Charpente maison Dupont",
        link: "/app/a-traiter",
      },
      {
        organizationId: orgId,
        userId: users.owner.id,
        type: "problem.reported",
        title: "Problème signalé : Charpente maison Dupont",
        body: "Une panne est fendue sur 40 cm, à remplacer avant la couverture.",
        link: `/app/chantiers/${siteDupont.id}/journal`,
      },
    ],
  });

  return {
    organization: organization.name,
    comptes: Object.values(DEMO_USERS).map((u) => `${u.email} (${u.role})`),
    motDePasse: DEMO_PASSWORD,
    lienClientDemo: `/s/${DEMO_PORTAL_TOKEN}`,
  };
}
