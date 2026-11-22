import { describe, expect, it } from "vitest";
import { escapeCell, toCsv } from "@/server/domain/csv";
import { guessClientMapping, mapClientRow } from "@/server/domain/csv-mapping";

describe("CSV export", () => {
  it("escapes separators, quotes and new lines", () => {
    expect(escapeCell("a;b")).toBe('"a;b"');
    expect(escapeCell('dit "bonjour"')).toBe('"dit ""bonjour"""');
    expect(escapeCell("ligne 1\nligne 2")).toBe('"ligne 1\nligne 2"');
    expect(escapeCell(null)).toBe("");
    expect(escapeCell(true)).toBe("oui");
    expect(escapeCell(new Date("2026-11-23T10:00:00Z"))).toBe("2026-11-23");
  });

  it("neutralizes formulas (CSV injection)", () => {
    expect(escapeCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(escapeCell("+33612345678")).toBe("'+33612345678");
    expect(escapeCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("adds a BOM and uses ; with CRLF", () => {
    const csv = toCsv(["Nom", "Ville"], [["Dupont", "Castanet"]]);
    expect(csv.startsWith("﻿Nom;Ville\r\nDupont;Castanet\r\n")).toBe(true);
  });
});

describe("client import mapping", () => {
  it("guesses French headers", () => {
    const mapping = guessClientMapping([
      "Prénom",
      "Nom",
      "Société",
      "E-mail",
      "Téléphone portable",
      "Adresse",
      "CP",
      "Ville",
      "Commentaire",
    ]);
    expect(mapping).toMatchObject({
      firstName: "Prénom",
      name: "Nom",
      companyName: "Société",
      email: "E-mail",
      phone: "Téléphone portable",
      address: "Adresse",
      postalCode: "CP",
      city: "Ville",
      notes: "Commentaire",
    });
  });

  it("maps a row to client form values", () => {
    const mapping = guessClientMapping(["Prénom", "Nom", "Email", "Tel", "Adresse", "Code postal", "Ville"]);
    expect(
      mapClientRow(
        {
          Prénom: "Claire",
          Nom: "Bernard",
          Email: "claire@exemple.fr",
          Tel: "07 11 22 33 44",
          Adresse: "14 allée des Chênes",
          "Code postal": "31650",
          Ville: "Saint-Orens",
        },
        mapping,
      ),
    ).toEqual({
      type: "INDIVIDUAL",
      name: "Claire Bernard",
      companyName: undefined,
      emails: "claire@exemple.fr",
      phones: "07 11 22 33 44",
      addresses: "14 allée des Chênes, 31650 Saint-Orens",
      tags: "",
      notes: undefined,
    });
  });

  it("detects professional clients", () => {
    const mapping = guessClientMapping(["Raison sociale", "Type"]);
    expect(
      mapClientRow({ "Raison sociale": "SCI Les Tilleuls", Type: "Professionnel" }, mapping),
    ).toMatchObject({
      type: "PROFESSIONAL",
      name: "SCI Les Tilleuls",
      companyName: "SCI Les Tilleuls",
    });
  });
});
