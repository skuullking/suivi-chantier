"use client";

import { Search } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const loadDialog = () => import("./command-palette-dialog");
// cmdk + dialog are only downloaded when the search is about to be used (hover, focus, Ctrl+K).
const CommandPaletteDialog = dynamic(loadDialog, { ssr: false });

/** Global search, opened with Ctrl/Cmd+K or the header button. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMounted(true);
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const preload = () => void loadDialog();

  return (
    <>
      <Button
        variant="outline"
        className="text-muted-foreground border-ink-200 h-11 w-full max-w-[520px] justify-start gap-2.5 bg-white font-normal"
        onPointerEnter={preload}
        onFocus={preload}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
        aria-label="Rechercher (Ctrl+K)"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Rechercher…</span>
        <kbd className="bg-ink-50 text-ink-600 hidden rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase sm:inline">
          Ctrl K
        </kbd>
      </Button>
      {mounted ? <CommandPaletteDialog open={open} setOpen={setOpen} /> : null}
    </>
  );
}
