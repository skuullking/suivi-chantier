/** Generated sample files for the development simulators (no download, no external asset). */
import PDFDocument from "pdfkit";
import sharp from "sharp";

export async function samplePhoto(label: string): Promise<Buffer> {
  const safe = label.replace(/[<>&]/g, "").slice(0, 60);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <rect width="1200" height="900" fill="#9cc9f0"/><rect y="640" width="1200" height="260" fill="#8a6d4b"/>
    <rect x="260" y="420" width="680" height="220" fill="#e9e1d4"/>
    <path d="M240 430 L600 200 L960 430 Z" fill="none" stroke="#b9773a" stroke-width="18"/>
    <rect x="0" y="800" width="1200" height="100" fill="#000" opacity="0.45"/>
    <text x="30" y="865" font-family="Arial, sans-serif" font-size="42" fill="#fff">${safe}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

/** One second of silence (valid WAV) to simulate a voice note. */
export function sampleVoice(seconds = 1): Buffer {
  const rate = 8000;
  const samples = rate * seconds;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  // Tiny noise so that two simulated voices never have the same hash (transcripts are keyed by content).
  for (let i = 0; i < 64; i++) buffer.writeInt16LE(Math.floor(Math.random() * 20) - 10, 44 + i * 2);
  return buffer;
}

export function samplePdf(title: string, lines: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(18).text(title);
    doc.moveDown();
    doc.fontSize(11);
    for (const line of lines) doc.text(line);
    doc.end();
  });
}
