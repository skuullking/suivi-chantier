/**
 * Demo data: "Charpentes Martin". The demo organization is deleted and recreated.
 *   pnpm db:seed                 → (re)creates the demo
 *   pnpm db:seed --if-missing    → only when the demo organization does not exist yet (docker compose)
 *
 *   Patron  : patron@demo.chantierlink.fr
 *   Bureau  : bureau@demo.chantierlink.fr
 *   Ouvrier : jean@demo.chantierlink.fr
 *   Ouvrier : lucas@demo.chantierlink.fr
 *   Mot de passe (tous) : chantier-demo
 */
import "dotenv/config";
import { db } from "@/server/db";
import { DEMO_SLUG, seedDemo } from "./seed/demo";

async function main() {
  if (process.argv.includes("--if-missing")) {
    const existing = await db.organization.findUnique({ where: { slug: DEMO_SLUG } });
    if (existing) {
      console.log("✔ Données de démonstration déjà présentes (rien à faire).");
      return;
    }
  }
  const summary = await seedDemo();
  console.log("✔ Données de démonstration créées :");
  console.log(summary);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("✘ Échec du seed :", error);
    process.exit(1);
  });
