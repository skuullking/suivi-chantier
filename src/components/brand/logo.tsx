import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <rect
        x="0.75"
        y="0.75"
        width="30.5"
        height="30.5"
        rx="8"
        fill="#ffd400"
        stroke="#121212"
        strokeWidth="1.5"
      />
      <path
        d="M8 22 16 10l8 12M12 22h8"
        fill="none"
        stroke="#121212"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  href = "/",
  className,
  tone = "dark",
}: {
  href?: string;
  className?: string;
  /** "dark" text on light backgrounds, "light" text on ink backgrounds. */
  tone?: "dark" | "light";
}) {
  return (
    <Link
      href={href}
      aria-label="ChantierLink"
      className={cn(
        "font-heading inline-flex items-center gap-2.5 text-[1.3rem] font-extrabold tracking-[-0.03em]",
        tone === "light" ? "text-white" : "text-ink-900",
        className,
      )}
    >
      <LogoMark />
      <span aria-hidden>chantierlink</span>
    </Link>
  );
}
