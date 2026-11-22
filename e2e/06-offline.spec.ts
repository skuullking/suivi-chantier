import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { DEMO, signIn } from "./helpers";

async function photo(color: string) {
  return sharp({ create: { width: 640, height: 480, channels: 3, background: color } })
    .jpeg()
    .toBuffer();
}

test("hors-ligne : 3 photos sans réseau, puis tout est synchronisé au retour du réseau", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await signIn(page, DEMO.worker1);
  await expect(page).toHaveURL(/\/w$/);
  // The service worker is installed and the day is cached.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.goto("/w/photo");
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);
  await expect(page.getByRole("status").filter({ hasText: "Hors ligne" })).toBeVisible();
  await page.getByTestId("photo-input").setInputFiles([
    { name: "a.jpg", mimeType: "image/jpeg", buffer: await photo("#aa5500") },
    { name: "b.jpg", mimeType: "image/jpeg", buffer: await photo("#5500aa") },
    { name: "c.jpg", mimeType: "image/jpeg", buffer: await photo("#00aa55") },
  ]);
  const tiles = page.getByTestId("sent-photo");
  await expect(tiles).toHaveCount(3);
  for (const tile of await tiles.all()) await expect(tile).toHaveAttribute("data-status", "waiting");
  await expect(page.getByTestId("queue-badge")).toHaveText("3");

  // Network back: automatic synchronization (no reload needed).
  await context.setOffline(false);
  for (const tile of await tiles.all())
    await expect(tile).toHaveAttribute("data-status", "sent", { timeout: 30_000 });
  await expect(page.getByTestId("queue-badge")).toHaveCount(0);
  await page.goto("/w/moi");
  await expect(page.getByTestId("queue-summary")).toHaveText("Tout est envoyé ✔");

  // The office sees the 3 photos (idempotent: no duplicate).
  await context.clearCookies();
  await signIn(page, DEMO.owner);
  await page.goto("/app/a-traiter");
  await expect(page.getByTestId("photo-tile")).toHaveCount(5); // 2 demo photos + 3 sent offline
});
