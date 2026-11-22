import { expect, test } from "@playwright/test";
import PDFDocument from "pdfkit";
import { DEMO, signIn } from "./helpers";

function invoicePdf(lines: string[]): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    for (const line of lines) doc.text(line);
    doc.end();
  });
}

test("upload d'une facture → classement automatique → retrouvée dans la recherche", async ({ page }) => {
  await signIn(page, DEMO.owner);
  await page.goto("/app/documents");
  await page.waitForLoadState("networkidle"); // hydrated: the file input listens to changes
  const pdf = await invoicePdf([
    "QUINCAILLERIE DU LAURAGAIS SAS",
    "Facture n° F-2026-990 du 16/11/2026",
    "Chantier Dupont - Castanet-Tolosan",
    "Vis de charpente et equerres",
    "Total TTC : 2 480,00 EUR",
  ]);
  await page
    .getByTestId("upload-input")
    .setInputFiles({ name: "scan-0042.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.getByLabel("Type de document")).toHaveValue("");
  await page.getByRole("button", { name: /Envoyer 1 fichier/ }).click();

  // The pipeline runs in the background: reload until the document is classified.
  const row = page.getByTestId("document-row").filter({ hasText: "scan-0042" });
  await expect(async () => {
    await page.reload();
    await expect(row).toContainText("Facture", { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(row).toContainText("Charpente maison Dupont");
  await expect(row).toContainText("2 480,00");
  await expect(row).toContainText("QUINCAILLERIE DU LAURAGAIS");

  // Full-text search on the content of the file
  await page.getByLabel("Rechercher un document").fill("lauragais");
  await page.getByRole("button", { name: "Filtrer" }).click();
  await expect(page.getByTestId("document-row")).toHaveCount(1);
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Nom de client, chantier, facture…").fill("F-2026-990");
  await expect(page.getByRole("option", { name: /scan-0042/ })).toBeVisible();
});

test("e-mail entrant simulé → facture rangée automatiquement", async ({ page }) => {
  await page.goto("/dev/inbound-mail");
  await page.getByLabel("Destinataire").selectOption("docs-charpentes-martin@docs.chantierlink.local");
  await page.getByRole("button", { name: "Envoyer l'e-mail" }).click();
  await expect(page.getByText(/E-mail reçu ✔ 1 document/)).toBeVisible();
  await expect(page.getByTestId("inbound-document").filter({ hasText: "Facture F-2026-881" })).toContainText(
    "Charpente maison Dupont",
    {
      timeout: 15_000,
    },
  );
});

test("dossier de fin de chantier, export ZIP et import CSV", async ({ page }) => {
  await signIn(page, DEMO.owner);
  await page.goto("/app/chantiers?statut=ALL");
  await page.getByTestId("site-card").filter({ hasText: "SCI Les Tilleuls" }).click();
  await expect(page).toHaveURL(/\/app\/chantiers\/[a-z0-9]+$/);
  await page
    .getByRole("navigation", { name: "Sections du chantier" })
    .getByRole("link", { name: "Documents" })
    .click();
  await page.getByRole("button", { name: "Générer le dossier de fin de chantier" }).click();
  await expect(page.getByText(/Dossier de fin de chantier en préparation/)).toBeVisible();
  await expect(async () => {
    await page.reload();
    await expect(
      page.getByTestId("document-row").filter({ hasText: "Dossier de fin de chantier" }),
    ).toHaveCount(1, { timeout: 1000 });
  }).toPass({ timeout: 30_000 });

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exporter le chantier (ZIP)" }).click();
  const zip = await download;
  expect(zip.suggestedFilename()).toMatch(/^ROU-3-.+\.zip$/);

  await page.goto("/app/clients/import");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("csv-input").setInputFiles({
    name: "clients.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Nom;Prénom;E-mail;Téléphone;Ville\nRoussel;Anne;anne.roussel@exemple.fr;0612121212;Blagnac\nFaure;Marc;marc.faure@exemple.fr;0613131313;Colomiers\n",
    ),
  });
  await expect(page.getByLabel("Nom du client *")).toHaveValue("Nom");
  await page.getByRole("button", { name: "Importer 2 lignes" }).click();
  await expect(page.getByTestId("import-result")).toContainText("2 client(s) créé(s)");
  await page.goto("/app/clients?q=roussel");
  await expect(page.getByTestId("client-row")).toContainText("Anne Roussel");
});
