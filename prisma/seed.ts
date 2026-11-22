/**
 * Demo data: "Charpentes Martin". Idempotent: the demo organization is deleted and recreated.
 *
 *   Patron  : patron@demo.chantierlink.fr
 *   Bureau  : bureau@demo.chantierlink.fr
 *   Ouvrier : jean@demo.chantierlink.fr
 *   Ouvrier : lucas@demo.chantierlink.fr
 *   Mot de passe (tous) : chantier-demo
 */
import "dotenv/config";
import { seedDemo } from "./seed/demo";

seedDemo()
  .then((summary) => {
    console.log("✔ Données de démonstration créées :");
    console.log(summary);
    process.exit(0);
  })
  .catch((error) => {
    console.error("✘ Échec du seed :", error);
    process.exit(1);
  });
