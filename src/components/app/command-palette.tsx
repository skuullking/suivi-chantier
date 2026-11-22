"use client";

import { FileText, HardHat, Plus, Search, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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

/** Global search, opened with Ctrl/Cmd+K or the header button. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    <>
      <Button
        variant="outline"
        className="text-muted-foreground h-9 w-full max-w-xs justify-start gap-2 font-normal"
        onClick={() => setOpen(true)}
        aria-label="Rechercher (Ctrl+K)"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Rechercher…</span>
        <kbd className="hidden rounded border bg-stone-50 px-1.5 text-[10px] font-medium sm:inline">
          Ctrl K
        </kbd>
      </Button>
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
    </>
  );
}

function CommandInputWrapper({ query, setQuery }: { query: string; setQuery: (q: string) => void }) {
  return (
    <CommandInput placeholder="Nom de client, chantier, facture…" value={query} onValueChange={setQuery} />
  );
}
