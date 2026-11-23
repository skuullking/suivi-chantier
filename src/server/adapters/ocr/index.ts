/**
 * Text extraction of documents. PDFs with a text layer are always read directly (unpdf, no OCR needed).
 * Images / scanned PDFs: `mock` returns the text registered by the simulators (or nothing), `tesseract` runs a
 * local OCR (tesseract.js, French). Scanned PDFs without a text layer are not rasterized (see DECISIONS.md).
 */
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractText } from "unpdf";
import { storage } from "@/server/adapters/storage";
import { sha256Hex } from "@/server/auth/tokens";
import { env } from "@/server/env";
import { logger } from "@/server/logger";

export type OcrInput = { bytes: Uint8Array; mimeType: string };

export interface OcrProvider {
  readonly name: string;
  imageText(input: OcrInput): Promise<string>;
}

export function simulatorOcrKey(bytes: Uint8Array) {
  return `dev/ocr/${sha256Hex(Buffer.from(bytes))}.txt`;
}

class MockOcrProvider implements OcrProvider {
  readonly name = "mock";
  async imageText(input: OcrInput) {
    return storage()
      .get(simulatorOcrKey(input.bytes))
      .then((b) => b.toString("utf8"))
      .catch(() => "");
  }
}

class TesseractOcrProvider implements OcrProvider {
  readonly name = "tesseract";
  async imageText(input: OcrInput) {
    const { createWorker } = await import("tesseract.js");
    // The French model (~15 MB) is downloaded once and cached outside the project folder.
    const cachePath = path.join(os.tmpdir(), "chantierlink-tesseract");
    await mkdir(cachePath, { recursive: true });
    const worker = await createWorker("fra", 1, { cachePath });
    try {
      const { data } = await worker.recognize(Buffer.from(input.bytes));
      return data.text;
    } finally {
      await worker.terminate();
    }
  }
}

let provider: OcrProvider | null = null;

export function ocr(): OcrProvider {
  provider ??= env().OCR_PROVIDER === "tesseract" ? new TesseractOcrProvider() : new MockOcrProvider();
  return provider;
}

export function setOcrProvider(p: OcrProvider | null) {
  provider = p;
}

/** Text of a document (PDF text layer, plain text, or OCR for images). Never throws. */
export async function documentText(input: OcrInput): Promise<string> {
  try {
    if (input.mimeType === "application/pdf") {
      const { text } = await extractText(new Uint8Array(input.bytes), { mergePages: true });
      if (text.trim().length > 20) return text;
      // Scan without text layer: the simulator / mock may still know its text.
      return await ocr().imageText(input);
    }
    if (input.mimeType.startsWith("text/")) return new TextDecoder().decode(input.bytes);
    if (input.mimeType.startsWith("image/")) return await ocr().imageText(input);
  } catch (error) {
    logger.warn({ err: error }, "Extraction du texte impossible");
  }
  return "";
}
