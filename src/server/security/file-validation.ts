/**
 * Strict upload validation: the real type is detected from the file content (magic bytes), never trusted from
 * the browser. Active content (HTML, SVG, scripts) is always rejected. File names are sanitized.
 */
import { fileTypeFromBuffer } from "file-type";
import { AppError } from "@/server/errors";

export type FileCategory = "document" | "image" | "audio" | "video";

type Allowed = { mime: string; ext: string; category: FileCategory };

const DETECTED: Record<string, Allowed> = {
  "application/pdf": { mime: "application/pdf", ext: "pdf", category: "document" },
  "image/jpeg": { mime: "image/jpeg", ext: "jpg", category: "image" },
  "image/png": { mime: "image/png", ext: "png", category: "image" },
  "image/webp": { mime: "image/webp", ext: "webp", category: "image" },
  "image/heic": { mime: "image/heic", ext: "heic", category: "image" },
  "image/heif": { mime: "image/heif", ext: "heif", category: "image" },
  "image/avif": { mime: "image/avif", ext: "avif", category: "image" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: "docx",
    category: "document",
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: "xlsx",
    category: "document",
  },
  "application/vnd.oasis.opendocument.text": {
    mime: "application/vnd.oasis.opendocument.text",
    ext: "odt",
    category: "document",
  },
  "application/vnd.oasis.opendocument.spreadsheet": {
    mime: "application/vnd.oasis.opendocument.spreadsheet",
    ext: "ods",
    category: "document",
  },
  "audio/webm": { mime: "audio/webm", ext: "webm", category: "audio" },
  "video/webm": { mime: "audio/webm", ext: "webm", category: "audio" },
  "audio/ogg": { mime: "audio/ogg", ext: "ogg", category: "audio" },
  "audio/opus": { mime: "audio/ogg", ext: "ogg", category: "audio" },
  "audio/mpeg": { mime: "audio/mpeg", ext: "mp3", category: "audio" },
  "audio/wav": { mime: "audio/wav", ext: "wav", category: "audio" },
  "audio/x-wav": { mime: "audio/wav", ext: "wav", category: "audio" },
  "audio/aac": { mime: "audio/aac", ext: "aac", category: "audio" },
  "audio/x-m4a": { mime: "audio/mp4", ext: "m4a", category: "audio" },
  "audio/mp4": { mime: "audio/mp4", ext: "m4a", category: "audio" },
  "video/mp4": { mime: "video/mp4", ext: "mp4", category: "video" },
  "video/quicktime": { mime: "video/quicktime", ext: "mov", category: "video" },
};

/** Text formats have no magic bytes: accepted only by extension and when the content is clean UTF-8 text. */
const TEXT_EXTENSIONS: Record<string, Allowed> = {
  txt: { mime: "text/plain", ext: "txt", category: "document" },
  csv: { mime: "text/csv", ext: "csv", category: "document" },
};

const FORBIDDEN_TEXT = /<\s*(script|html|svg|iframe|object|embed)\b|<\?xml/i;

export type ValidatedFile = {
  mimeType: string;
  ext: string;
  category: FileCategory;
  safeName: string;
};

/** Removes path parts, control characters and risky characters; keeps accents. */
export function sanitizeFilename(name: string, fallback = "fichier"): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*;]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .trim();
  const limited = cleaned.length > 120 ? cleaned.slice(0, 120) : cleaned;
  return limited || fallback;
}

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(name);
  return match ? match[1]!.toLowerCase() : "";
}

function withExtension(name: string, ext: string): string {
  const current = extensionOf(name);
  if (current === ext || (ext === "jpg" && current === "jpeg")) return name;
  const stem = current ? name.slice(0, -(current.length + 1)) : name;
  return `${stem || "fichier"}.${ext}`;
}

export async function validateUpload(
  buffer: Uint8Array,
  originalName: string,
  options: { allowed: FileCategory[]; maxBytes: number },
): Promise<ValidatedFile> {
  if (buffer.byteLength === 0) throw new AppError(`« ${originalName} » est vide.`, "EMPTY_FILE");
  if (buffer.byteLength > options.maxBytes) {
    throw new AppError(
      `« ${originalName} » dépasse la taille maximale (${Math.round(options.maxBytes / 1024 / 1024)} Mo).`,
      "FILE_TOO_LARGE",
      413,
    );
  }
  const safeName = sanitizeFilename(originalName);
  const detected = await fileTypeFromBuffer(buffer);
  let allowed: Allowed | undefined;
  if (detected) {
    allowed = DETECTED[detected.mime];
  } else {
    const ext = extensionOf(safeName);
    const candidate = TEXT_EXTENSIONS[ext];
    if (candidate) {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer.subarray(0, 64 * 1024));
      if (!text.includes("\u0000") && !text.includes("�") && !FORBIDDEN_TEXT.test(text)) {
        allowed = candidate;
      }
    }
  }
  if (!allowed || !options.allowed.includes(allowed.category)) {
    throw new AppError(`Le format de « ${originalName} » n'est pas accepté.`, "UNSUPPORTED_FILE_TYPE", 415);
  }
  return {
    mimeType: allowed.mime,
    ext: allowed.ext,
    category: allowed.category,
    safeName: withExtension(safeName, allowed.ext),
  };
}

/** Human list of accepted formats for documents (shown in upload zones). */
export const DOCUMENT_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.docx,.xlsx,.odt,.ods,.txt,.csv,application/pdf,image/*";
