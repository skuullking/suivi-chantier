import { describe, expect, it } from "vitest";
import { sanitizeFilename, validateUpload } from "@/server/security/file-validation";

const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1,
  8, 6, 0, 0, 0,
]);
const opts = { allowed: ["document", "image"] as ("document" | "image")[], maxBytes: 1024 * 1024 };

describe("validateUpload", () => {
  it("detects the real type from the content", async () => {
    const r = await validateUpload(PDF, "facture.PDF", opts);
    expect(r).toMatchObject({ mimeType: "application/pdf", ext: "pdf", safeName: "facture.PDF" });
  });
  it("fixes a misleading extension", async () => {
    const r = await validateUpload(PNG, "photo.pdf", opts);
    expect(r.mimeType).toBe("image/png");
    expect(r.safeName).toBe("photo.png");
  });
  it("rejects HTML and SVG even with an innocent name", async () => {
    await expect(
      validateUpload(new TextEncoder().encode("<html><script>alert(1)</script></html>"), "devis.txt", opts),
    ).rejects.toThrow(/format/);
    await expect(
      validateUpload(
        new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        "plan.svg",
        opts,
      ),
    ).rejects.toThrow(/format/);
    await expect(
      validateUpload(new TextEncoder().encode("<?xml version='1.0'?><svg/>"), "plan.csv", opts),
    ).rejects.toThrow(/format/);
  });
  it("accepts plain text and CSV", async () => {
    const r = await validateUpload(
      new TextEncoder().encode("nom;téléphone\nDupont;0612"),
      "clients.csv",
      opts,
    );
    expect(r.mimeType).toBe("text/csv");
  });
  it("rejects unknown binaries, empty and oversized files", async () => {
    await expect(
      validateUpload(new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]), "setup.exe", opts),
    ).rejects.toThrow();
    await expect(validateUpload(new Uint8Array(), "vide.pdf", opts)).rejects.toThrow(/vide/);
    await expect(validateUpload(PDF, "gros.pdf", { ...opts, maxBytes: 10 })).rejects.toThrow(/taille/);
  });
  it("only accepts allowed categories", async () => {
    await expect(validateUpload(PDF, "a.pdf", { allowed: ["image"], maxBytes: 1e6 })).rejects.toThrow(
      /format/,
    );
  });
});

describe("sanitizeFilename", () => {
  it("removes paths and dangerous characters", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Users\\x\\Devis <Dupont>.pdf")).toBe("Devis Dupont.pdf");
    expect(sanitizeFilename("..hidden")).toBe("hidden");
    expect(sanitizeFilename("a\u0000b\u0007c.pdf")).toBe("abc.pdf");
    expect(sanitizeFilename("")).toBe("fichier");
  });
  it("keeps accents and limits the length", () => {
    expect(sanitizeFilename("Été 2026 — reçu.pdf")).toBe("Été 2026 — reçu.pdf");
    expect(sanitizeFilename("x".repeat(300)).length).toBe(120);
  });
});
