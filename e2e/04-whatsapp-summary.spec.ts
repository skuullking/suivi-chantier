import { expect, test } from "@playwright/test";
import { DEMO, signIn } from "./helpers";

const DEMO_PORTAL = "/s/demo-dupont-suivi-chantier-0123456789abcdefABCDEF";

test("WhatsApp (photo + vocal) → classement auto → transcription → résumé du jour → approbation → visible au client", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // The worker (Jean, only planned on the Dupont site today) writes from WhatsApp.
  await page.goto("/dev/whatsapp");
  await page.getByRole("link", { name: /Jean Lefèvre/ }).click();
  await expect(page).toHaveURL(/tel=/);

  await page.getByRole("radio", { name: "Photo" }).click();
  await page.getByLabel("Légende").fill("Lisse basse posée");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(
    page.getByTestId("wa-reply").filter({ hasText: "Reçu ✅ Chantier « Charpente maison Dupont »" }),
  ).toHaveCount(1, {
    timeout: 15_000,
  });

  await page.getByRole("radio", { name: "Vocal" }).click();
  await page
    .getByLabel("Texte du vocal")
    .fill("On a terminé le contreventement, demain on attaque la couverture.");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByTestId("wa-reply").filter({ hasText: "Reçu ✅" })).toHaveCount(2, {
    timeout: 15_000,
  });

  await page.getByRole("radio", { name: "Texte" }).click();
  await page.getByLabel("Message", { exact: true }).fill("Problème : il manque deux liteaux");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByTestId("wa-reply").filter({ hasText: "Problème transmis au bureau" })).toHaveCount(
    1,
    { timeout: 15_000 },
  );

  // The owner sees the transcription in the journal and validates the photo.
  await signIn(page, DEMO.owner);
  await page.goto("/app/chantiers?statut=ALL");
  await page.getByTestId("site-card").filter({ hasText: "Charpente maison Dupont" }).click();
  await expect(page).toHaveURL(/\/app\/chantiers\/[a-z0-9]+$/);
  const siteUrl = page.url();
  await page.goto(`${siteUrl}/journal`);
  await expect(
    page.getByTestId("journal-note").filter({ hasText: "On a terminé le contreventement" }),
  ).toBeVisible();
  await expect(page.getByTestId("journal-note").filter({ hasText: "il manque deux liteaux" })).toContainText(
    "Problème",
  );

  await page.goto("/app/a-traiter");
  const tile = page.getByTestId("photo-tile").filter({ hasText: "Lisse basse posée" });
  await tile.getByRole("checkbox", { name: "Sélectionner" }).check();
  await page.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(page.getByTestId("photo-tile").filter({ hasText: "Lisse basse posée" })).toHaveCount(0);

  // Daily summary: generated, edited, approved.
  await page.goto(`${siteUrl}/journal`);
  await page.getByRole("button", { name: "Générer le résumé du jour" }).click();
  await expect(page.getByText("Résumé du jour prêt")).toBeVisible();
  await page.goto("/app/a-traiter");
  const draft = page.getByTestId("summary-draft").filter({ hasText: "Charpente maison Dupont" });
  await expect(draft).toBeVisible();
  const generated = await draft.getByRole("textbox").inputValue();
  expect(generated).not.toMatch(/liteaux|problème/i);
  await draft
    .getByRole("textbox")
    .fill("Belle journée chez vous : le contreventement est terminé, la couverture commence demain.");
  await draft.getByRole("button", { name: "Approuver et envoyer" }).click();
  await expect(page.getByText(/Résumé publié sur l'espace client/)).toBeVisible();

  // The client sees it (and the validated photo), never the problem.
  await page.goto(DEMO_PORTAL);
  await expect(page.getByText("le contreventement est terminé, la couverture commence demain")).toBeVisible();
  await expect(page.getByRole("button", { name: /Lisse basse posée/ })).toBeVisible();
  await expect(page.getByText("liteaux")).toHaveCount(0);
});

test("un numéro inconnu reçoit une réponse polie", async ({ page }) => {
  await page.goto("/dev/whatsapp");
  await page.getByRole("link", { name: /Numéro inconnu/ }).click();
  await page.getByLabel("Message", { exact: true }).fill("Bonjour");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(
    page.getByTestId("wa-reply").filter({ hasText: "n'est pas encore reconnu" }).first(),
  ).toBeVisible({
    timeout: 15_000,
  });
});

test("le webhook refuse une signature invalide et répond à la vérification Meta", async ({ request }) => {
  const bad = await request.post("/api/webhooks/whatsapp", {
    headers: { "x-hub-signature-256": "sha256=deadbeef", "content-type": "application/json" },
    data: { entry: [] },
  });
  expect(bad.status()).toBe(401);
  const verify = await request.get(
    "/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=dev-verify-token&hub.challenge=12345",
  );
  expect(await verify.text()).toBe("12345");
  const wrong = await request.get(
    "/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1",
  );
  expect(wrong.status()).toBe(403);
});
