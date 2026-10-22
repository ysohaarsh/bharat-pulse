import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceStrict } from "date-fns";
import { requireUser } from "@/components/auth/session";
import { Notice } from "@/components/auth/notice";
import { BTN_SECONDARY, FOCUS } from "@/components/auth/styles";
import { Lotus } from "@/components/hud/ornaments";
import { CATEGORY_META } from "@/lib/categories";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/types";
import { safeHttpUrl } from "@/lib/url";
import { markAlertRead, markAllAlertsRead } from "./actions";

export const metadata: Metadata = { title: "Alerts — Bharat Pulse" };

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
      className={`stamp stamp-flat ${value >= 4 ? "stamp-danger" : value === 3 ? "stamp-warn" : "stamp-teal"}`}
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
      "id, read_at, created_at, events(id, title, category, severity, occurred_at, url, state), watchlists(id, name)",
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
        <header>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-maroon">Alerts</h1>
              <p className="text-sm text-ink-soft">
                {unread > 0 ? `${unread} unread` : "All caught up"} · events matching your{" "}
                <Link href="/watchlists" className="font-semibold text-accent hover:underline">
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
          </div>
          <div className="ornament-divider !mb-0 w-full" />
        </header>

        {error && <Notice kind="error">Couldn&apos;t load alerts: {error.message}</Notice>}

        {!error && alerts.length === 0 && (
          <div className="ledger-panel flex flex-col items-center gap-1 px-4 py-10 text-center">
            <Lotus className="h-5 w-8 text-gold" />
            <p className="font-display text-sm uppercase tracking-[0.06em] text-maroon">कोई सूचना नहीं</p>
            <p className="text-sm text-muted">No alerts yet.</p>
            <p className="text-sm text-muted">
              When a new event matches one of your{" "}
              <Link href="/watchlists" className="font-semibold text-accent hover:underline">
                watchlists
              </Link>
              , it&apos;ll appear here.
            </p>
          </div>
        )}

        {alerts.length > 0 && (
          <section className="ledger-panel" aria-label="Alerts register">
            <header className="ledger-header">
              <h2 className="ledger-title">
                <span className="acct">खाता 01 ·</span>Alerts register
              </h2>
              <span className="label">सूचना बही</span>
            </header>
            <ul>
              {alerts.map((a) => {
                const ev = a.events;
                const isUnread = a.read_at === null;
                const meta = ev ? CATEGORY_META[ev.category as Category] : undefined;
                const href = safeHttpUrl(ev?.url);
                return (
                  <li key={a.id} className={`ledger-row !items-start ${isUnread ? "is-selected" : ""}`}>
                    <span className="record-id pt-0.5">#{String(a.id).padStart(4, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm leading-snug ${isUnread ? "font-semibold text-ink" : "text-muted"}`}>
                        {isUnread && <span className="sr-only">Unread: </span>}
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer" className={`hover:underline ${FOCUS}`}>
                            {ev.title}
                          </a>
                        ) : (
                          (ev?.title ?? "Event no longer available")
                        )}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                        {meta && (
                          <span className="inline-flex items-center gap-1 font-semibold text-ink-soft">
                            <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                            {meta.label}
                          </span>
                        )}
                        {ev && <Severity value={ev.severity} />}
                        {ev && (
                          <time className="num" dateTime={ev.occurred_at} title={ev.occurred_at}>
                            {relative(ev.occurred_at, now)}
                          </time>
                        )}
                        {ev?.state && <span className="chip !cursor-default !py-0 num">{ev.state}</span>}
                        {a.watchlists && <span>· {a.watchlists.name}</span>}
                      </p>
                    </div>
                    {isUnread && (
                      <form action={markAlertRead.bind(null, a.id)} className="shrink-0 self-center">
                        <button
                          type="submit"
                          aria-label={`Mark "${ev?.title ?? "alert"}" as read`}
                          className="btn-ghost !px-2 !py-0.5 !text-xs"
                        >
                          Mark read
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="ledger-total">
              <span>कुल / Total</span>
              <span className="num">
                {alerts.length} · {unread} unread
              </span>
            </div>
          </section>
        )}
        {alerts.length === LIMIT && <p className="text-center text-xs text-muted">Showing the latest {LIMIT} alerts.</p>}
      </div>
    </div>
  );
}
