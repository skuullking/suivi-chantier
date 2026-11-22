"use client";

import { FileUp, Loader2 } from "lucide-react";
import Link from "next/link";
import Papa from "papaparse";
import { useState, useTransition } from "react";
import { notify } from "@/components/app/notify";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CLIENT_IMPORT_FIELDS,
  type ClientMapping,
  guessClientMapping,
  mapClientRow,
} from "@/server/domain/csv-mapping";
import { importClientsAction } from "@/server/actions/data";

type Result = {
  created: number;
  skipped: number;
  errorCount: number;
  errors: { line: number; message: string }[];
};

export function ClientImport() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ClientMapping>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  function onFile(file: File | undefined) {
    setError(null);
    setResult(null);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError("Fichier trop volumineux (5 Mo maximum).");
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      // Excel FR exports are often in Windows-1252; UTF-8 is tried first by the browser.
      encoding: "UTF-8",
      complete: (res) => {
        const fields = (res.meta.fields ?? []).filter(Boolean);
        if (fields.length === 0)
          return setError("Aucune colonne trouvée. Vérifiez que la première ligne contient les titres.");
        setHeaders(fields);
        setRows(res.data.slice(0, 2000));
        setMapping(guessClientMapping(fields));
        if (res.data.length > 2000) setError("Seules les 2 000 premières lignes seront importées.");
      },
      error: () => setError("Lecture du fichier impossible."),
    });
  }

  const preview = rows.slice(0, 5).map((r) => mapClientRow(r, mapping));

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Choisir le fichier</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center hover:border-orange-400">
            <FileUp className="size-8 text-stone-400" aria-hidden />
            <span className="font-medium">{fileName ?? "Choisir un fichier .csv"}</span>
            <span className="text-muted-foreground text-xs">
              Séparateur virgule ou point-virgule, première ligne = titres des colonnes
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              data-testid="csv-input"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
          {error ? (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {headers.length ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Associer les colonnes ({rows.length} lignes)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CLIENT_IMPORT_FIELDS.map((field) => (
                <label key={field.key} className="grid gap-1 text-sm font-medium">
                  {field.label}
                  {field.required ? " *" : ""}
                  <select
                    value={mapping[field.key] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [field.key]: e.target.value || null }))}
                    className="h-9 rounded-lg border bg-white px-2 font-normal"
                  >
                    <option value="">— Ignorer —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="text-muted-foreground p-2 text-left text-xs">
                  Aperçu des 5 premières lignes
                </caption>
                <thead className="bg-stone-50 text-left text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2">Nom</th>
                    <th className="px-3 py-2">E-mail</th>
                    <th className="px-3 py-2">Téléphone</th>
                    <th className="px-3 py-2">Adresse</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.map((p, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        {p.name || <span className="text-red-700">manquant</span>}
                      </td>
                      <td className="px-3 py-2">{p.emails}</td>
                      <td className="px-3 py-2">{p.phones}</td>
                      <td className="px-3 py-2">{p.addresses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <Button
                disabled={pending || (!mapping.name && !mapping.companyName)}
                onClick={() =>
                  startTransition(async () => {
                    const res = await importClientsAction(rows, mapping);
                    notify(res);
                    if (res.ok) setResult(res.data as Result);
                  })
                }
              >
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Importer {rows.length} ligne{rows.length > 1 ? "s" : ""}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {result ? (
        <Card data-testid="import-result">
          <CardHeader>
            <CardTitle>3. Résultat</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>
              <strong>{result.created}</strong> client(s) créé(s), <strong>{result.skipped}</strong> ignoré(s)
              (doublons ou lignes vides), <strong>{result.errorCount}</strong> erreur(s).
            </p>
            {result.errors.length ? (
              <ul className="list-inside list-disc text-red-800">
                {result.errors.map((e) => (
                  <li key={e.line}>
                    Ligne {e.line} : {e.message}
                  </li>
                ))}
              </ul>
            ) : null}
            <Button asChild variant="outline" className="w-fit">
              <Link href="/app/clients">Voir les clients</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
