import { expect, type Page } from "@playwright/test";

export const DEMO = {
  owner: "patron@demo.chantierlink.fr",
  office: "bureau@demo.chantierlink.fr",
  worker1: "jean@demo.chantierlink.fr",
  worker2: "lucas@demo.chantierlink.fr",
  password: "chantier-demo",
};

export async function signIn(page: Page, email: string, password = DEMO.password) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/connexion/);
}

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
}
