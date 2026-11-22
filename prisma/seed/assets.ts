/**
 * Demo assets generated locally (no download): construction-like illustrations with sharp, PDFs with pdfkit.
 */
import PDFDocument from "pdfkit";
import sharp from "sharp";

const PALETTES = [
  { sky: ["#9cc9f0", "#e8f3fc"], ground: "#8a6d4b", wood: "#c98b4a" },
  { sky: ["#f2c38f", "#fbe7d2"], ground: "#6f7d4f", wood: "#b9773a" },
  { sky: ["#b8c6d6", "#eef2f6"], ground: "#7c7468", wood: "#a5683a" },
  { sky: ["#a8d8c8", "#eaf7f2"], ground: "#5f6f4a", wood: "#d29a5c" },
];

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A 1600×1200 JPEG illustration (house frame / roof truss) with a caption. */
export async function demoPhoto(caption: string, variant: number, progress = 0.6) {
  const p = PALETTES[variant % PALETTES.length]!;
  const w = 1600;
  const h = 1200;
  const groundY = 900;
  const trusses = Math.max(2, Math.round(9 * progress));
  const truss = Array.from({ length: trusses }, (_, i) => {
    const x = 380 + i * 105;
    return `<path d="M${x} 600 L${x + 60} 380 L${x + 120} 600 Z" fill="none" stroke="${p.wood}" stroke-width="14"/>
            <line x1="${x + 60}" y1="380" x2="${x + 60}" y2="600" stroke="${p.wood}" stroke-width="10"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.sky[1]}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#sky)"/>
    <circle cx="1350" cy="180" r="80" fill="#fff6c9" opacity="0.8"/>
    <rect y="${groundY}" width="${w}" height="${h - groundY}" fill="${p.ground}"/>
    <rect x="360" y="600" width="980" height="300" fill="#e9e1d4" stroke="#9c8f7c" stroke-width="6"/>
    <rect x="520" y="700" width="140" height="200" fill="#8b5a33"/>
    <rect x="800" y="680" width="180" height="120" fill="#a9c7de" stroke="#6d6253" stroke-width="6"/>
    <rect x="1080" y="680" width="180" height="120" fill="#a9c7de" stroke="#6d6253" stroke-width="6"/>
    <line x1="360" y1="600" x2="1340" y2="600" stroke="${p.wood}" stroke-width="18"/>
    ${truss}
    <rect x="160" y="520" width="20" height="380" fill="#d9d2c4"/><rect x="1440" y="520" width="20" height="380" fill="#d9d2c4"/>
    <rect x="0" y="${h - 110}" width="${w}" height="110" fill="#000" opacity="0.45"/>
    <text x="40" y="${h - 45}" font-family="Arial, Helvetica, sans-serif" font-size="46" fill="#fff">${escapeXml(caption)}</text>
  </svg>`;
  const original = await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
  const thumbnail = await sharp(original).resize(480, 360, { fit: "cover" }).jpeg({ quality: 75 }).toBuffer();
  return { original, thumbnail, width: w, height: h };
}

/** Simple A4 PDF (quote, invoice, plan…). */
export function demoPdf(options: {
  title: string;
  company: string;
  lines: string[];
  table?: { label: string; amount: number }[];
  footer?: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: options.title } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fillColor("#c2410c").fontSize(20).text(options.company);
    doc.moveDown(0.5).fillColor("#111").fontSize(16).text(options.title);
    doc.moveDown();
    doc.fontSize(11).fillColor("#333");
    for (const line of options.lines) doc.text(line);
    if (options.table) {
      doc.moveDown();
      let total = 0;
      for (const row of options.table) {
        total += row.amount;
        const y = doc.y;
        doc.text(row.label, 50, y, { width: 380 });
        doc.text(`${row.amount.toFixed(2).replace(".", ",")} €`, 430, y, { width: 110, align: "right" });
        doc.moveDown(0.4);
      }
      doc.moveDown(0.5).fontSize(12).fillColor("#111");
      const y = doc.y;
      doc.text("Total TTC", 50, y, { width: 380 });
      doc.text(`${total.toFixed(2).replace(".", ",")} €`, 430, y, { width: 110, align: "right" });
    }
    doc
      .moveDown(2)
      .fontSize(9)
      .fillColor("#777")
      .text(options.footer ?? "Document de démonstration ChantierLink.", 50);
    doc.end();
  });
}
