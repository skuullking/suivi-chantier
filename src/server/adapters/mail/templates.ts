const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type EmailContent = {
  title: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  footer?: string;
};

/** Simple, robust transactional e-mail layout (HTML + plain text). */
export function renderEmail(content: EmailContent): { html: string; text: string } {
  const paragraphs = content.paragraphs
    .map((p) => `<p style="margin:0 0 16px;line-height:1.5;color:#1f2937">${escape(p)}</p>`)
    .join("");
  const cta = content.cta
    ? `<p style="margin:24px 0"><a href="${escape(content.cta.url)}" style="background:#c2410c;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${escape(content.cta.label)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;color:#6b7280">Si le bouton ne fonctionne pas, copiez ce lien : ${escape(content.cta.url)}</p>`
    : "";
  const footer = content.footer ?? "Envoyé par ChantierLink.";
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px">
    <div style="background:#ffffff;border-radius:12px;padding:28px">
      <h1 style="font-size:20px;margin:0 0 20px;color:#111827">${escape(content.title)}</h1>
      ${paragraphs}${cta}
    </div>
    <p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:16px">${escape(footer)}</p>
  </div></body></html>`;
  const text = [
    content.title,
    "",
    ...content.paragraphs.flatMap((p) => [p, ""]),
    ...(content.cta ? [`${content.cta.label} : ${content.cta.url}`, ""] : []),
    footer,
  ].join("\n");
  return { html, text };
}
