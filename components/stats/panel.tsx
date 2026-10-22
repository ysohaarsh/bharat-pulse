import type { ReactNode } from "react";

/** A ledger page. `code` renders as the account number: "खाता 01 · TITLE". */
export function Panel({
  title,
  code,
  subtitle,
  className = "",
  children,
}: {
  title: string;
  code?: string;
  subtitle?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`ledger-panel flex min-w-0 flex-col ${className}`}>
      <header className="ledger-header">
        <h2 className="ledger-title !whitespace-normal">
          {code && <span className="acct">खाता {code} ·</span>}
          {title}
        </h2>
        {subtitle && <p className="label">{subtitle}</p>}
      </header>
      <div className="flex min-w-0 flex-1 flex-col p-4">{children}</div>
    </section>
  );
}

export function EmptyChart({ message }: { message?: string }) {
  return (
    <div className="flex min-h-40 flex-1 flex-col items-center justify-center px-4 py-3 text-center">
      <div aria-hidden className="ornament-divider w-40 max-w-full" />
      <p className="font-display text-sm text-maroon">इस बही में अभी कोई प्रविष्टि नहीं</p>
      <p className="label mt-1 !normal-case !tracking-normal">{message ?? "No entries in this register yet"}</p>
    </div>
  );
}
