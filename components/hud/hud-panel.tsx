import type { ReactNode } from "react";

/**
 * Ledger page: red-margin panel with a ruled account header ("खाता 02 · THEATER").
 * Styles live in `.ledger-panel` / `.ledger-header` / `.ledger-title` (globals.css; docs/DESIGN.md).
 * `as` lets callers pick the landmark (section/aside) so accessible names stay meaningful.
 */
export function HudPanel({
  title,
  code,
  right,
  as: Tag = "section",
  className = "",
  bodyClassName = "",
  headingLevel = 2,
  cloth = false,
  children,
  ...rest
}: {
  title: string;
  /** Account number shown before the title, e.g. "02" renders as "खाता 02". */
  code?: string;
  right?: ReactNode;
  as?: "section" | "aside" | "div";
  className?: string;
  bodyClassName?: string;
  headingLevel?: 1 | 2 | 3;
  /** Maroon cloth header instead of the paper one. */
  cloth?: boolean;
  children: ReactNode;
} & React.AriaAttributes) {
  const Heading = `h${headingLevel}` as const;
  return (
    <Tag className={`ledger-panel flex min-w-0 flex-col ${className}`} {...rest}>
      <header className={`ledger-header shrink-0 ${cloth ? "ledger-header--cloth" : ""}`}>
        <Heading className="ledger-title">
          {code && (
            <span aria-hidden className="acct">
              खाता {code} ·
            </span>
          )}
          {title}
        </Heading>
        {right}
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </Tag>
  );
}
