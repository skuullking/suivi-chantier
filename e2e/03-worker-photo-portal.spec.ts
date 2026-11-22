import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { DEMO, signIn, uniqueEmail } from "./helpers";

async function photo() {
  return sharp({ create: { width: 800, height: 600, channels: 3, background: "#b9773a" } })
    .jpeg()
    .toBuffer();
}

test("ouvrier invité → voit sa journée → envoie une photo → le patron valide → le client la voit ; lien révoqué = expiré", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  // Owner signs up and creates a site
  await page.goto("/inscription");
  await page.getByLabel("Nom de l'entreprise").fill("Toitures Garnier");
  await page.getByLabel("Votre métier principal").selectOption("CARPENTER");
  await page.getByLabel("Votre nom").fill("Alice Garnier");
  await page.getByLabel("Adresse e-mail").fill(uniqueEmail("garnier"));
  await page.getByLabel("Mot de passe").fill("motdepasse-solide");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/app\/bienvenue/);

  await page.goto("/app/chantiers/nouveau");
  await page.getByLabel("Nom du client").fill("M. Roche");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByLabel("Adresse du chantier").fill("4 rue du Moulin");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Créer le chantier" }).click();
  await expect(page.getByRole("heading", { name: "Chantier M. Roche" })).toBeVisible();
  const siteUrl = page.url();

  // Invite a worker
  await page.goto("/app/equipe");
  await page.getByLabel("E-mail", { exact: true }).fill(uniqueEmail("ouvrier"));
  await page.getByLabel("Rôle", { exact: true }).selectOption("WORKER");
  await page.getByRole("button", { name: "Envoyer l'invitation" }).click();
  const invitationUrl = (await page.getByTestId("invitation-link").textContent())!.trim();

  const workerContext = await browser.newContext();
  const worker = await workerContext.newPage();
  await worker.goto(invitationUrl);
  await worker.getByLabel("Votre nom").fill("Marc Petit");
  await worker.getByLabel("Choisissez un mot de passe").fill("motdepasse-ouvrier");
  await worker.getByRole("button", { name: "Rejoindre l'équipe" }).click();
  await expect(worker).toHaveURL(/\/w$/);
  await expect(worker.getByText("Pas de chantier prévu aujourd'hui.")).toBeVisible();

  // Owner plans the worker today on the site
  await page.goto(`${siteUrl}/planning`);
  await page
    .getByRole("row")
    .filter({ hasText: "Marc Petit" })
    .locator('[data-today="true"] button[aria-label^="Ajouter"]')
    .click();
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.getByTestId("planning-chip")).toHaveCount(1);

  // The worker sees his day, arrives and sends a photo
  await worker.reload();
  const card = worker.getByTestId("worker-site");
  await expect(card).toContainText("Chantier M. Roche");
  await card.getByRole("button", { name: "J'arrive" }).click();
  await expect(card.getByRole("button", { name: "Arrivé ✔" })).toBeVisible();
  await card.getByRole("link", { name: "Photo" }).click();
  await expect(worker).toHaveURL(/\/w\/photo\?chantier=/);
  await worker
    .getByTestId("photo-input")
    .setInputFiles({ name: "toit.jpg", mimeType: "image/jpeg", buffer: await photo() });
  await expect(worker.getByTestId("sent-photo").first()).toHaveAttribute("data-status", "sent");

  // The owner validates it
  await page.goto("/app/a-traiter");
  await expect(page.getByTestId("photo-tile")).toHaveCount(1);
  await page.getByRole("checkbox", { name: "Sélectionner" }).check();
  await page.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(page.getByText("Aucune photo à valider")).toBeVisible();

  // Client link
  await page.goto(`${siteUrl}/espace-client`);
  await page.getByRole("button", { name: "Créer le lien client" }).click();
  const portalUrl = (await page.getByTestId("portal-url").textContent())!.trim();
  expect(portalUrl).toMatch(/\/s\/[A-Za-z0-9_-]{43}$/);

  const clientContext = await browser.newContext();
  const client = await clientContext.newPage();
  await expect(async () => {
    await client.goto(portalUrl);
    await expect(client.getByTestId("portal-photo")).toHaveCount(1, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(client.getByRole("heading", { name: "Chantier M. Roche" })).toBeVisible();
  const robots = await client.locator('meta[name="robots"]').getAttribute("content");
  expect(robots).toContain("noindex");
  const response = await client.request.get(portalUrl);
  expect(response.headers()["x-robots-tag"]).toContain("noindex");

  // E2E n°5: revoking the link → "lien expiré"
  await page.getByRole("button", { name: "Révoquer" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Révoquer" }).click();
  await expect(page.getByRole("button", { name: "Créer le lien client" })).toBeVisible();
  await client.goto(portalUrl);
  await expect(client.getByTestId("portal-expired")).toBeVisible();
  await expect(client.getByText("Ce lien n'est plus valide")).toBeVisible();

  await workerContext.close();
  await clientContext.close();
});

test("un ouvrier n'ouvre pas un chantier non affecté ; une organisation ne voit pas les données d'une autre", async ({
  page,
  browser,
}) => {
  // Find the id of a demo site Jean is not assigned to.
  await signIn(page, DEMO.owner);
  await page.goto("/app/chantiers?statut=ALL");
  await page.getByTestId("site-card").filter({ hasText: "SCI Les Tilleuls" }).click();
  await expect(page).toHaveURL(/\/app\/chantiers\/[a-z0-9]+$/);
  const siteId = page.url().split("/").pop()!;

  const workerContext = await browser.newContext();
  const worker = await workerContext.newPage();
  await signIn(worker, DEMO.worker1);
  await expect(worker).toHaveURL(/\/w$/);
  // Worker pages stream (loading state): the 404 page is rendered in the response body.
  await worker.goto(`/w/chantier/${siteId}`);
  await expect(worker.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  await expect(worker.getByText("Rénovation toiture")).toHaveCount(0);
  await worker.goto("/app/chantiers");
  await expect(worker).toHaveURL(/\/w$/);
  // Upload to a site he is not assigned to: refused by the API
  const upload = await worker.request.post("/api/w/media", {
    headers: { origin: new URL(worker.url()).origin },
    multipart: {
      siteId,
      file: { name: "p.jpg", mimeType: "image/jpeg", buffer: await photo() },
    },
  });
  expect(upload.status()).toBe(404);
  // Cross-site request (CSRF) refused
  const csrf = await worker.request.post("/api/w/media", {
    headers: { origin: "https://evil.example" },
    multipart: { siteId, file: { name: "p.jpg", mimeType: "image/jpeg", buffer: await photo() } },
  });
  expect(csrf.status()).toBe(403);
  await workerContext.close();

  // Another organization cannot open the site
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await other.goto("/inscription");
  await other.getByLabel("Nom de l'entreprise").fill("Concurrent SARL");
  await other.getByLabel("Votre métier principal").selectOption("JOINER");
  await other.getByLabel("Votre nom").fill("Eve Concurrente");
  await other.getByLabel("Adresse e-mail").fill(uniqueEmail("eve"));
  await other.getByLabel("Mot de passe").fill("motdepasse-solide");
  await other.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(other).toHaveURL(/\/app\/bienvenue/);
  // /app pages stream (loading state), so the 404 is rendered in the page rather than as an HTTP status.
  await other.goto(`/app/chantiers/${siteId}`);
  await expect(other.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  await expect(other.getByText("Rénovation toiture")).toHaveCount(0);
  await other.goto(`/app/chantiers/${siteId}/documents`);
  await expect(other.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  await other.goto("/app/chantiers?statut=ALL");
  await expect(other.getByText("Aucun chantier")).toBeVisible();
  // Tampered signed file URL
  const forged = await other.request.get("/api/files/eyJrIjoib3JnL3gvZG9jcyJ9.signature");
  expect(forged.status()).toBe(403);
  await otherContext.close();
});

test("le portail de démonstration affiche l'avancement, les photos validées et les documents partagés", async ({
  page,
}) => {
  await page.goto("/s/demo-dupont-suivi-chantier-0123456789abcdefABCDEF");
  await expect(page.getByRole("heading", { name: "Charpente maison Dupont" })).toBeVisible();
  await expect(page.getByTestId("portal-progress")).toContainText("%");
  await expect(page.getByTestId("portal-photo").first()).toBeVisible();
  await expect(page.getByText("Devis D-2026-041 charpente Dupont")).toBeVisible();
  await expect(page.getByText("Une panne est fendue")).toHaveCount(0);
  await expect(page.getByText("Bon de commande Scierie du Comminges")).toHaveCount(0);
});
