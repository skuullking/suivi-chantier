"use client";

import { FileText, HardHat, Plus, Search, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type Result = {
  kind: "client" | "site" | "document";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

const GROUPS: { kind: Result["kind"]; label: string; icon: typeof HardHat }[] = [
  { kind: "site", label: "Chantiers", icon: HardHat },
  { kind: "client", label: "Clients", icon: UserRound },
  { kind: "document", label: "Documents", icon: FileText },
];

/** Search dialog (cmdk), loaded on demand by CommandPalette. */
export default function CommandPaletteDialog({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    controller.current?.abort();
    // Empty query: the shortcuts are shown instead of results.
    if (!q) return;
    const c = new AbortController();
    controller.current = c;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: c.signal });
        if (res.ok) setResults(((await res.json()) as { results: Result[] }).results);
      } catch {
        // aborted or offline: keep previous results
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [query]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Recherche"
      description="Chantiers, clients et documents"
    >
      {/* Filtering is done server-side (full-text search). */}
      <Command shouldFilter={false}>
        <CommandInputWrapper query={query} setQuery={setQuery} />
        <CommandList>
          {query.trim() === "" ? (
            <CommandGroup heading="Raccourcis">
              <CommandItem onSelect={() => go("/app/chantiers/nouveau")}>
                <Plus /> Nouveau chantier
              </CommandItem>
              <CommandItem onSelect={() => go("/app/clients/nouveau")}>
                <Plus /> Nouveau client
              </CommandItem>
              <CommandItem onSelect={() => go("/app/planning")}>
                <Search /> Ouvrir le planning
              </CommandItem>
            </CommandGroup>
          ) : (
            <>
              <CommandEmpty>{loading ? "Recherche…" : "Aucun résultat."}</CommandEmpty>
              {GROUPS.map((g) => {
                const items = results.filter((r) => r.kind === g.kind);
                if (items.length === 0) return null;
                return (
                  <CommandGroup key={g.kind} heading={g.label}>
                    {items.map((r) => (
                      <CommandItem key={r.id} value={`${r.kind}-${r.id}`} onSelect={() => go(r.href)}>
                        <g.icon aria-hidden />
                        <div className="min-w-0">
                          <p className="truncate">{r.title}</p>
                          {r.subtitle ? (
                            <p className="text-muted-foreground truncate text-xs">{r.subtitle}</p>
                          ) : null}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

function CommandInputWrapper({ query, setQuery }: { query: string; setQuery: (q: string) => void }) {
  return (
    <CommandInput placeholder="Nom de client, chantier, facture…" value={query} onValueChange={setQuery} />
  );
}
