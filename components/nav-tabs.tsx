"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export interface NavTab {
  href: string;
  label: string;
  /** Extra content after the label, e.g. an unread badge. */
  extra?: ReactNode;
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent";

/** Console-style tabs; the current section is lit up in phosphor green. */
export function NavTabs({ tabs }: { tabs: NavTab[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex h-full min-w-0 items-stretch gap-1 overflow-x-auto">
      {tabs.map((t, i) => {
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`group relative flex shrink-0 items-center gap-1.5 px-3 text-[11px] uppercase tracking-[0.16em] transition-colors ${FOCUS} ${
              active ? "bg-accent/10 text-accent glow" : "text-muted hover:bg-accent/5 hover:text-foreground"
            }`}
          >
            <span aria-hidden className={active ? "text-accent" : "text-border-strong group-hover:text-muted"}>
              {String(i + 1).padStart(2, "0")}
            </span>
            {t.label}
            {t.extra}
            <span
              aria-hidden
              className={`absolute inset-x-0 bottom-0 h-0.5 ${active ? "bg-accent shadow-[0_0_8px_var(--accent)]" : "bg-transparent"}`}
            />
          </Link>
        );
      })}
    </nav>
  );
}
