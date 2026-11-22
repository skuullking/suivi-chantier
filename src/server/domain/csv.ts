/**
 * CSV helpers (pure). Exports use `;` and a UTF-8 BOM so that Excel (French locale) opens them correctly.
 * Cells starting with = + - @ are prefixed with ' to prevent CSV / formula injection.
 */

export type Cell = string | number | boolean | null | undefined | Date;

function cellText(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "boolean") return value ? "oui" : "non";
  return String(value);
}

export function escapeCell(value: Cell, separator = ";"): string {
  let text = cellText(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (text.includes(separator) || text.includes('"') || /[\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(headers: string[], rows: Cell[][], separator = ";"): string {
  const lines = [headers, ...rows].map((row) => row.map((c) => escapeCell(c, separator)).join(separator));
  return `﻿${lines.join("\r\n")}\r\n`;
}
