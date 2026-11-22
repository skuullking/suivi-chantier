import { expect, test } from "@playwright/test";
import { uniqueEmail } from "./helpers";

test("onboarding, abonnement simulé, export RGPD et suppression du compte", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const email = uniqueEmail("onboarding");
  await page.goto("/inscription");
  await page.getByLabel("Nom de l'entreprise").fill("Piscines Azur");
  await page.getByLabel("Votre métier principal").selectOption("POOL");
  await page.getByLabel("Votre nom").fill("Lina Azur");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill("motdepasse-solide");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/app\/bienvenue/);

  // Step 1: the trade template is loaded.
  await expect(page.getByTestId("onboarding-step-1")).toContainText("Terrassement");
  // Step 3 + 4: example site with a client link.
  await page.getByRole("button", { name: "Créer un chantier d'exemple" }).click();
  const url = page.getByTestId("onboarding-portal-url");
  await expect(url).toBeVisible();
  const portal = (await url.textContent())!.trim();
  const client = await browser.newContext();
  const clientPage = await client.newPage();
  await clientPage.goto(portal);
  await expect(clientPage.getByRole("heading", { name: "Chantier d'exemple" })).toBeVisible();
  await expect(clientPage.getByTestId("portal-progress")).not.toHaveText("0 %");
  await client.close();

  // Simulated subscription
  await page.goto("/app/parametres/abonnement");
  await expect(page.getByText(/Formule Équipe — Essai gratuit/)).toBeVisible();
  await page.getByTestId("plan-PRO").getByRole("button", { name: "Choisir Pro" }).click();
  await expect(page).toHaveURL(/paiement-simule/);
  await page.getByRole("button", { name: "Confirmer le paiement (simulation)" }).click();
  await expect(page.getByText("Votre abonnement est actif.")).toBeVisible();
  await expect(page.getByTestId("plan-PRO")).toContainText("Votre formule actuelle");

  // GDPR export
  await page.goto("/app/parametres/donnees");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Télécharger l'export complet" }).click();
  expect((await download).suggestedFilename()).toMatch(/^export-piscines-azur.*\.zip$/);

  // Account deletion (strong confirmation)
  await page.getByLabel(/Tapez le nom de l'entreprise/).fill("Piscines Azur");
  await page.getByLabel("Votre mot de passe").fill("mauvais");
  await page.getByRole("button", { name: "Supprimer définitivement mon compte" }).click();
  await expect(page.getByText("Mot de passe incorrect.")).toBeVisible();
  await page.getByLabel("Votre mot de passe").fill("motdepasse-solide");
  await page.getByRole("button", { name: "Supprimer définitivement mon compte" }).click();
  await expect(page).toHaveURL(/compte=supprime/);
  await expect(page.getByText("Votre compte a été supprimé")).toBeVisible();

  // The account no longer exists.
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill("motdepasse-solide");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("E-mail ou mot de passe incorrect.")).toBeVisible();
});

test("pages légales accessibles depuis l'accueil", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Mentions légales" }).click();
  await expect(page.getByRole("heading", { name: "Mentions légales", level: 1 })).toBeVisible();
  await page.goto("/confidentialite");
  await expect(page.getByRole("heading", { name: "Politique de confidentialité" })).toBeVisible();
  await page.goto("/cgu");
  await expect(page.getByRole("heading", { name: /Conditions générales/ })).toBeVisible();
});
