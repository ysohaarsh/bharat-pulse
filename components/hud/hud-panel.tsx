import type { ReactNode } from "react";

/**
 * Console panel with a green tab header and bracketed corners (see `.hud-*` in globals.css).
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
  children,
  ...rest
}: {
  title: string;
  /** Short designator shown before the title, e.g. "01". */
  code?: string;
  right?: ReactNode;
  as?: "section" | "aside" | "div";
  className?: string;
  bodyClassName?: string;
  headingLevel?: 1 | 2 | 3;
  children: ReactNode;
} & React.AriaAttributes) {
  const Heading = `h${headingLevel}` as const;
  return (
    <Tag className={`hud-panel flex min-w-0 flex-col ${className}`} {...rest}>
      <header className="hud-header shrink-0">
        <Heading className="hud-tab">
          {code && (
            <span aria-hidden className="opacity-60">
              {code}
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
