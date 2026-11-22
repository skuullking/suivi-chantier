import { expect, test } from "@playwright/test";
import { uniqueEmail } from "./helpers";

test("inscription d'une entreprise puis invitation d'un ouvrier qui rejoint l'équipe", async ({
  page,
  browser,
}) => {
  const ownerEmail = uniqueEmail("patron");
  await page.goto("/inscription");
  await page.getByLabel("Nom de l'entreprise").fill("Menuiserie Durand");
  await page.getByLabel("Votre métier principal").selectOption("JOINER");
  await page.getByLabel("Votre nom").fill("Claire Durand");
  await page.getByLabel("Adresse e-mail").fill(ownerEmail);
  await page.getByLabel("Mot de passe").fill("motdepasse-solide");
  await page.getByRole("button", { name: "Créer mon compte" }).click();

  await expect(page).toHaveURL(/\/app\/bienvenue/);
  await expect(page.getByRole("heading", { name: /Bienvenue sur ChantierLink/ })).toBeVisible();

  // Invite a worker
  await page.goto("/app/equipe");
  const workerEmail = uniqueEmail("ouvrier");
  await page.getByLabel("E-mail", { exact: true }).fill(workerEmail);
  await page.getByLabel("Nom (facultatif)").fill("Marc");
  await page.getByLabel("Rôle", { exact: true }).selectOption("WORKER");
  await page.getByRole("button", { name: "Envoyer l'invitation" }).click();
  const link = page.getByTestId("invitation-link");
  await expect(link).toBeVisible();
  const invitationUrl = (await link.textContent())!.trim();
  expect(invitationUrl).toContain("/invitation/");

  // The worker opens the link in another browser
  const workerContext = await browser.newContext();
  const workerPage = await workerContext.newPage();
  await workerPage.goto(invitationUrl);
  await expect(workerPage.getByRole("heading", { name: "Rejoindre Menuiserie Durand" })).toBeVisible();
  await workerPage.getByLabel("Votre nom").fill("Marc Petit");
  await workerPage.getByLabel("Choisissez un mot de passe").fill("motdepasse-ouvrier");
  await workerPage.getByRole("button", { name: "Rejoindre l'équipe" }).click();
  await expect(workerPage).toHaveURL(/\/w$/);
  await expect(workerPage.getByRole("heading", { name: /Bonjour Marc/ })).toBeVisible();

  // A worker cannot open the back-office
  await workerPage.goto("/app/equipe");
  await expect(workerPage).toHaveURL(/\/w$/);

  // The invitation link cannot be reused
  await workerPage.goto(invitationUrl);
  await expect(workerPage.getByRole("heading", { name: "Invitation expirée" })).toBeVisible();
  await workerContext.close();

  // The owner sees the new member
  await page.reload();
  await expect(page.getByTestId("member-row").filter({ hasText: "Marc Petit" })).toBeVisible();
});

test("connexion refusée avec un mauvais mot de passe", async ({ page }) => {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill("patron@demo.chantierlink.fr");
  await page.getByLabel("Mot de passe").fill("pas-le-bon");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("E-mail ou mot de passe incorrect.")).toBeVisible();
});
