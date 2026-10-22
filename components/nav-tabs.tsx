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

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-soft";

/** Ledger index tabs on the maroon cloth; the current section is lit in gold with a brass underline. */
export function NavTabs({ tabs, className = "" }: { tabs: NavTab[]; className?: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className={`flex min-w-0 items-stretch gap-0.5 overflow-x-auto [scrollbar-width:none] ${className}`}
    >
      {tabs.map((t, i) => {
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`group relative flex shrink-0 items-center gap-1.5 px-3 text-[11.5px] font-semibold uppercase tracking-[0.12em] transition-colors ${FOCUS} ${
              active ? "bg-maroon-deep text-gold-soft" : "text-cream/80 hover:bg-maroon-deep/60 hover:text-cream"
            }`}
          >
            <span aria-hidden className={`num text-[10px] font-normal ${active ? "text-haldi" : "text-cream/50"}`}>
              {String(i + 1).padStart(2, "0")}
            </span>
            {t.label}
            {t.extra}
            <span aria-hidden className={`absolute inset-x-1 bottom-0 h-0.5 ${active ? "bg-gold-soft" : "bg-transparent"}`} />
          </Link>
        );
      })}
    </nav>
  );
}
