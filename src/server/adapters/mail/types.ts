export type MailAttachment = { filename: string; content: Buffer; contentType?: string };

export type MailMessage = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: MailAttachment[];
  /** Organization the message belongs to (for the outgoing message log). */
  organizationId?: string | null;
};

export interface MailProvider {
  readonly name: string;
  send(message: MailMessage): Promise<{ id: string }>;
}
