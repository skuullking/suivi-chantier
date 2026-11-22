/**
 * Generates a VAPID key pair for Web Push notifications.
 *   pnpm vapid
 * Copy the two lines into your .env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).
 */
import * as webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
