import type { ReactNode } from "react";
import { Chakra } from "@/components/hud/ornaments";

/** A form as an official register slip: maroon cloth head, form number in mono, ledger-page body. */
export function FormSlip({
  formNo,
  title,
  titleHi = "प्रपत्र",
  right,
  children,
  as: Tag = "section",
  className = "",
}: {
  formNo: string;
  title: ReactNode;
  titleHi?: string;
  right?: ReactNode;
  children: ReactNode;
  as?: "section" | "aside" | "div";
  className?: string;
}) {
  return (
    <Tag className={`ledger-panel ${className}`}>
      <header className="ledger-header ledger-header--cloth">
        <h2 className="ledger-title !whitespace-normal">
          <span className="acct">{titleHi} ·</span>
          {title}
        </h2>
        <span className="num text-[11px] tracking-wider text-gold-soft">{right ?? `FORM ${formNo}`}</span>
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </Tag>
  );
}

/** Centred page shell for login / forgot / reset screens: chakra, wordmark, then the slip. */
export function AuthShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-md px-4 py-8 sm:py-12">
        <div className="mb-4 flex flex-col items-center text-center">
          <Chakra className="h-10 w-10 text-maroon" />
          <p className="mt-2 font-display text-lg uppercase tracking-[0.08em] text-maroon">Bharat Pulse</p>
          <p className="font-display text-sm text-warn">भारत पल्स</p>
          <div className="ornament-divider w-48" />
          <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-maroon">{title}</h1>
          {intro && <p className="mt-1 max-w-sm text-sm text-ink-soft">{intro}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
