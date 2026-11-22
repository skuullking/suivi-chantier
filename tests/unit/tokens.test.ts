import { describe, expect, it } from "vitest";
import { generateToken, hashToken, safeEqual } from "@/server/auth/tokens";
import { signFileUrl, verifyFileToken } from "@/server/files";
import { slugify } from "@/lib/slug";
import { safeRedirectPath, signUpSchema } from "@/lib/validation/auth";

describe("tokens", () => {
  it("generates long random URL-safe tokens (≥ 32 bytes)", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, "base64url").length).toBeGreaterThanOrEqual(32);
  });

  it("hashes deterministically without storing the token", () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
    expect(hashToken(t)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("compares in constant time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("signed file URLs", () => {
  it("round-trips a valid signature", () => {
    const url = signFileUrl("org/x/media/1/original.jpg", {
      filename: "photo.jpg",
      disposition: "attachment",
    });
    const token = url.replace("/api/files/", "");
    expect(verifyFileToken(token)).toEqual({
      key: "org/x/media/1/original.jpg",
      disposition: "attachment",
      filename: "photo.jpg",
      contentType: undefined,
    });
  });

  it("rejects tampered payloads", () => {
    const token = signFileUrl("org/x/a.jpg").replace("/api/files/", "");
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ k: "org/y/b.jpg", e: 9999999999, d: "inline" })).toString(
      "base64url",
    );
    expect(verifyFileToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyFileToken(`${payload}.invalid`)).toBeNull();
  });

  it("rejects expired links", () => {
    const token = signFileUrl("org/x/a.jpg", { ttlSeconds: 60 }).replace("/api/files/", "");
    expect(verifyFileToken(token, Date.now() + 10 * 60 * 1000)).toBeNull();
  });
});

describe("validation", () => {
  it("slugifies French names", () => {
    expect(slugify("Charpentes Martin & Fils")).toBe("charpentes-martin-fils");
    expect(slugify("Élagage Hervé")).toBe("elagage-herve");
  });

  it("validates sign-up input", () => {
    const ok = signUpSchema.safeParse({
      organizationName: "Charpentes Martin",
      trade: "CARPENTER",
      name: "Paul Martin",
      email: " Paul@Example.FR ",
      password: "motdepasse-solide",
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.email).toBe("paul@example.fr");

    const bad = signUpSchema.safeParse({
      organizationName: "",
      trade: "X",
      name: "",
      email: "x",
      password: "123",
    });
    expect(bad.success).toBe(false);
  });

  it("prevents open redirects", () => {
    expect(safeRedirectPath("/app/chantiers", "/app")).toBe("/app/chantiers");
    expect(safeRedirectPath("//evil.com", "/app")).toBe("/app");
    expect(safeRedirectPath("https://evil.com", "/app")).toBe("/app");
    expect(safeRedirectPath("/\\evil.com", "/app")).toBe("/app");
    expect(safeRedirectPath(null, "/app")).toBe("/app");
  });
});

describe("secret encryption", () => {
  it("round-trips and rejects tampering or another key", async () => {
    const { decryptSecret, encryptSecret } = await import("@/server/auth/tokens");
    const secret = "s".repeat(40);
    const value = encryptSecret("jeton-du-client", secret);
    expect(value).not.toContain("jeton");
    expect(decryptSecret(value, secret)).toBe("jeton-du-client");
    expect(decryptSecret(value, "t".repeat(40))).toBeNull();
    const [iv, tag, data] = value.split(".");
    const tampered = (data![0] === "A" ? "B" : "A") + data!.slice(1);
    expect(decryptSecret([iv, tag, tampered].join("."), secret)).toBeNull();
    expect(decryptSecret("pas-valide", secret)).toBeNull();
  });
});
