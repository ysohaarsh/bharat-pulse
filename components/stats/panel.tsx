import type { ReactNode } from "react";

export function Panel({
  title,
  subtitle,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`hud-panel flex min-w-0 flex-col ${className}`}>
      <header className="hud-header">
        <h2 className="hud-tab">{title}</h2>
        {subtitle && <p className="hud-label truncate !text-[9px]">{subtitle}</p>}
      </header>
      <div className="flex min-w-0 flex-1 flex-col p-4">{children}</div>
    </section>
  );
}

export function EmptyChart({ message = "No events in this window yet." }: { message?: string }) {
  return (
    <div className="flex min-h-40 flex-1 items-center justify-center border border-dashed border-border px-4 text-center text-xs uppercase tracking-widest text-muted">
      {message}
    </div>
  );
}
