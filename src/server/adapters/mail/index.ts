import { env } from "@/server/env";
import { ConsoleMailProvider, DevMailProvider, SmtpMailProvider } from "./providers";
import type { MailProvider } from "./types";

export type { MailMessage, MailProvider } from "./types";
export { renderEmail } from "./templates";

let instance: MailProvider | undefined;

export function mailProvider(): MailProvider {
  if (!instance) {
    switch (env().MAIL_DRIVER) {
      case "smtp":
        instance = new SmtpMailProvider();
        break;
      case "console":
        instance = new ConsoleMailProvider();
        break;
      default:
        instance = new DevMailProvider();
    }
  }
  return instance;
}

export function setMailProvider(provider: MailProvider | undefined) {
  instance = provider;
}
