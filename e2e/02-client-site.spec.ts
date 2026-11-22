import { expect, test } from "@playwright/test";
import { uniqueEmail } from "./helpers";

const PDF = Buffer.from("%PDF-1.4\n% devis charpente\n%%EOF");

test("inscription → prise en main → client → chantier depuis un modèle → étapes et documents", async ({
  page,
}) => {
  await page.goto("/inscription");
  await page.getByLabel("Nom de l'entreprise").fill("Charpentes Bertin");
  await page.getByLabel("Votre métier principal").selectOption("CARPENTER");
  await page.getByLabel("Votre nom").fill("Hugo Bertin");
  await page.getByLabel("Adresse e-mail").fill(uniqueEmail("bertin"));
  await page.getByLabel("Mot de passe").fill("motdepasse-solide");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/app\/bienvenue/);

  // Onboarding checklist on the dashboard
  await page.goto("/app");
  const onboarding = page.getByTestId("onboarding");
  await expect(onboarding).toContainText("1/5");

  // Create a client
  await page.getByRole("link", { name: "Nouveau client" }).first().click();
  await expect(page).toHaveURL(/\/app\/clients\/nouveau/);
  await page.getByLabel("Nom du client").fill("M. et Mme Lambert");
  await page.getByLabel("Téléphone(s)").fill("06 11 22 33 44");
  await page.getByLabel("E-mail(s)").fill("lambert@exemple.fr");
  await page.getByLabel("Adresse(s)").fill("5 impasse des Pins, 31500 Toulouse");
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByRole("heading", { name: "M. et Mme Lambert" })).toBeVisible();

  // Create a site for this client from the carpentry template
  await page.getByRole("link", { name: "Nouveau chantier" }).click();
  await expect(page.getByRole("option", { name: /M. et Mme Lambert/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByLabel("Titre du chantier")).toHaveValue("Chantier M. et Mme Lambert");
  await expect(page.getByLabel("Adresse du chantier")).toHaveValue("5 impasse des Pins");
  await expect(page.getByLabel("Code postal")).toHaveValue("31500");
  await expect(page.getByLabel("Ville")).toHaveValue("Toulouse");
  await page.getByLabel("Titre du chantier").fill("Charpente garage Lambert");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("radio", { name: /Charpente/ }).first()).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("button", { name: "Créer le chantier" }).click();

  await expect(page.getByRole("heading", { name: "Charpente garage Lambert" })).toBeVisible();
  await expect(page.getByText("LAM-1")).toBeVisible();
  await expect(page.getByText("Prise de côtes").first()).toBeVisible();

  // Complete the first step → progress 13 % (1 of 8 equal steps)
  await page
    .getByRole("navigation", { name: "Sections du chantier" })
    .getByRole("link", { name: "Étapes" })
    .click();
  await expect(page.getByTestId("step-row")).toHaveCount(8);
  await page.getByLabel("Statut de l'étape Prise de côtes").selectOption("DONE");
  await expect(page.getByRole("progressbar", { name: "Progression du chantier" })).toHaveAttribute(
    "aria-valuenow",
    "13",
  );

  // Add a step
  await page.getByRole("button", { name: "Ajouter une étape" }).click();
  await page.getByLabel("Nom de l'étape").fill("Pose des gouttières");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.getByTestId("step-row")).toHaveCount(9);

  // Upload a document and find it with the search
  await page
    .getByRole("navigation", { name: "Sections du chantier" })
    .getByRole("link", { name: "Documents" })
    .click();
  await page
    .getByTestId("upload-input")
    .setInputFiles({ name: "Devis Lambert.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByLabel("Type de document").selectOption("QUOTE");
  await page.getByRole("button", { name: /Envoyer 1 fichier/ }).click();
  await expect(page.getByTestId("document-row")).toContainText("Devis Lambert");

  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Nom de client, chantier, facture…").fill("lambert");
  await expect(page.getByRole("option", { name: /^Charpente garage Lambert \(LAM-1\)/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /^Devis Lambert/ })).toBeVisible();
  await page.getByRole("option", { name: /^M. et Mme Lambert/ }).click();
  await expect(page).toHaveURL(/\/app\/clients\//);

  // Onboarding progressed
  await page.goto("/app");
  await expect(page.getByTestId("onboarding")).toContainText("3/5");
  await expect(page.getByTestId("dashboard-site")).toContainText("Charpente garage Lambert");
});

test("le planning détecte les conflits et le patron voit la démo", async ({ page }) => {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill("patron@demo.chantierlink.fr");
  await page.getByLabel("Mot de passe").fill("chantier-demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByTestId("dashboard-site")).toHaveCount(2);
  await expect(page.getByTestId("alert-photos")).toContainText("2");

  await page.goto("/app/planning");
  await expect(page.getByTestId("planning-chip").first()).toBeVisible();
  await page.goto("/app/chantiers?vue=tableau");
  await expect(page.getByTestId("site-row")).toHaveCount(2);
  await page.goto("/app/chantiers?statut=ALL");
  await expect(page.getByTestId("site-card")).toHaveCount(3);
});
