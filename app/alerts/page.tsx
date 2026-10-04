import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceStrict } from "date-fns";
import { requireUser } from "@/components/auth/session";
import { BTN_SECONDARY, FOCUS } from "@/components/auth/styles";
import { CATEGORY_META } from "@/lib/categories";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/types";
import { safeHttpUrl } from "@/lib/url";
import { markAlertRead, markAllAlertsRead } from "./actions";

export const metadata: Metadata = { title: "Alerts — Pulse" };

const LIMIT = 200;

function relative(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown time";
  if (now - t < 60_000) return "just now";
  return formatDistanceStrict(t, now, { addSuffix: true });
}

function Severity({ value }: { value: number }) {
  return (
    <span
      title={`Severity ${value}/5`}
      className={`font-mono text-[11px] ${value >= 4 ? "text-danger" : "text-accent"}`}
    >
      S{value}
    </span>
  );
}

export default async function AlertsPage() {
  const user = await requireUser("/alerts");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alerts")
    .select(
      "id, read_at, created_at, events(id, title, category, severity, occurred_at, url, country), watchlists(id, name)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  const alerts = data ?? [];
  const unread = alerts.filter((a) => a.read_at === null).length;
  // eslint-disable-next-line react-hooks/purity -- server-rendered once per request
  const now = Date.now();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="glow text-lg font-bold uppercase tracking-[0.25em] text-accent">Alerts</h1>
            <p className="text-sm text-muted">
              {unread > 0 ? `${unread} unread` : "All caught up"} · events matching your{" "}
              <Link href="/watchlists" className="text-accent hover:underline">
                watchlists
              </Link>
            </p>
          </div>
          {unread > 0 && (
            <form action={markAllAlertsRead}>
              <button type="submit" className={BTN_SECONDARY}>
                Mark all read
              </button>
            </form>
          )}
        </header>

        {error && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
            Couldn&apos;t load alerts: {error.message}
          </p>
        )}

        {!error && alerts.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted">
            <p>No alerts yet.</p>
            <p className="mt-1">
              When a new event matches one of your{" "}
              <Link href="/watchlists" className="text-accent hover:underline">
                watchlists
              </Link>
              , it&apos;ll appear here.
            </p>
          </div>
        )}

        {alerts.length > 0 && (
          <ul className="overflow-hidden hud-panel">
            {alerts.map((a) => {
              const ev = a.events;
              const isUnread = a.read_at === null;
              const meta = ev ? CATEGORY_META[ev.category as Category] : undefined;
              const href = safeHttpUrl(ev?.url);
              return (
                <li
                  key={a.id}
                  className={`relative flex gap-3 border-b border-border py-3 pl-4 pr-3 last:border-b-0 ${
                    isUnread ? "bg-accent/5" : ""
                  }`}
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-1"
                    style={{ backgroundColor: meta?.color ?? "var(--border)" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm leading-snug ${isUnread ? "font-medium text-foreground" : "text-muted"}`}>
                      {isUnread && (
                        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" aria-hidden />
                      )}
                      {isUnread && <span className="sr-only">Unread: </span>}
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className={`hover:underline ${FOCUS}`}>
                          {ev.title}
                        </a>
                      ) : (
                        (ev?.title ?? "Event no longer available")
                      )}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                      {meta && <span style={{ color: meta.color }}>{meta.label}</span>}
                      {ev && <Severity value={ev.severity} />}
                      {ev && (
                        <time dateTime={ev.occurred_at} title={ev.occurred_at}>
                          {relative(ev.occurred_at, now)}
                        </time>
                      )}
                      {ev?.country && <span className="font-mono">{ev.country}</span>}
                      {a.watchlists && <span>· {a.watchlists.name}</span>}
                    </p>
                  </div>
                  {isUnread && (
                    <form action={markAlertRead.bind(null, a.id)} className="shrink-0 self-center">
                      <button
                        type="submit"
                        aria-label={`Mark "${ev?.title ?? "alert"}" as read`}
                        className={`rounded px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-foreground ${FOCUS}`}
                      >
                        Mark read
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {alerts.length === LIMIT && <p className="text-center text-xs text-muted">Showing the latest {LIMIT} alerts.</p>}
      </div>
    </div>
  );
}
