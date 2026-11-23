"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Immediate feedback on navigation, so a click never looks ignored while the server renders the next page.
 */

/** Href that was just clicked in a menu, until the URL actually changes (optimistic "active" tab). */
export function usePendingHref() {
  const pathname = usePathname();
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null);
  const pendingHref = pending && pending.from === pathname ? pending.href : null;
  return {
    /** Pathname to use for the "active" state: the clicked target first, the real URL otherwise. */
    current: pendingHref ?? pathname,
    pendingHref,
    onNavigate: (href: string) => {
      if (href !== pathname) setPending({ href, from: pathname });
    },
  };
}

function isInternalNavigation(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.("a");
  if (!anchor || anchor.hasAttribute("download")) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  const next = url.pathname + url.search;
  if (next === window.location.pathname + window.location.search) return null;
  return next;
}

/** Thin bar at the top of the screen from the click until the new page is shown. */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const location = search ? `${pathname}?${search}` : pathname;
  const [target, setTarget] = useState<{ from: string } | null>(null);
  const active = target !== null && target.from === location;

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (isInternalNavigation(event)) setTarget({ from: window.location.pathname + window.location.search });
    }
    // Capture phase: runs before Next's Link handler, even if it stops propagation.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden"
      data-testid="nav-progress"
      data-active={active ? "1" : "0"}
    >
      <div
        className={
          active
            ? "bg-signal-400 border-ink-900 h-full w-[85%] border-b transition-[width] duration-[2500ms] ease-out"
            : "h-full w-0 opacity-0"
        }
        style={active ? { animation: "nav-progress-start 2.5s ease-out" } : undefined}
      />
    </div>
  );
}
