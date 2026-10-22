import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/components/auth/session";
import { FormSlip } from "@/components/auth/form-slip";
import { Notice } from "@/components/auth/notice";
import { BTN_SECONDARY } from "@/components/auth/styles";
import { Lotus } from "@/components/hud/ornaments";
import { DeleteWatchlistButton } from "@/components/watchlists/delete-button";
import { WatchlistForm } from "@/components/watchlists/watchlist-form";
import { CATEGORY_META } from "@/lib/categories";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/types";
import { watchlistMapHref } from "@/lib/watchlists/links";
import { stateLabel, toFormValues } from "@/lib/watchlists/schema";

export const metadata: Metadata = { title: "Watchlists — Bharat Pulse" };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function Chip({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface px-2 py-0.5 text-[11.5px] text-ink-soft">
      {color && <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
      <dt className="label w-28 shrink-0 pt-0.5">{label}</dt>
      <dd className="flex flex-wrap gap-1.5 text-sm">{children}</dd>
    </div>
  );
}

export default async function WatchlistsPage({ searchParams }: PageProps<"/watchlists">) {
  const user = await requireUser("/watchlists");
  const editRaw = first((await searchParams).edit);
  const editId = editRaw && /^\d+$/.test(editRaw) ? Number(editRaw) : null;

  const supabase = await createClient();
  const { data: watchlists, error } = await supabase
    .from("watchlists")
    .select("id, name, states, categories, keywords, min_severity, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const list = watchlists ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[1fr_22rem]">
        <section aria-labelledby="wl-heading" className="flex min-w-0 flex-col gap-4">
          <header>
            <h1 id="wl-heading" className="font-display text-2xl uppercase tracking-[0.08em] text-maroon">
              Watchlists
            </h1>
            <p className="text-sm text-ink-soft">
              New events matching a watchlist show up in your{" "}
              <Link href="/alerts" className="font-semibold text-accent hover:underline">
                alerts
              </Link>
              .
            </p>
            <div className="ornament-divider !mb-0 w-full" />
          </header>

          {error && <Notice kind="error">Couldn&apos;t load watchlists: {error.message}</Notice>}

          {!error && list.length === 0 && (
            <div className="ledger-panel flex flex-col items-center gap-1 px-4 py-10 text-center">
              <Lotus className="h-5 w-8 text-gold" />
              <p className="font-display text-sm uppercase tracking-[0.06em] text-maroon">कोई निगरानी सूची नहीं</p>
              <p className="text-sm text-muted">No watchlists yet. Create one to start getting alerts.</p>
            </div>
          )}

          {list.length > 0 && (
            <div className="ledger-panel">
              <header className="ledger-header">
                <h2 className="ledger-title">
                  <span className="acct">खाता 01 ·</span>Register
                </h2>
                <span className="label">निगरानी सूची / watchlists</span>
              </header>
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Watchlist / सूची</th>
                    <th className="num">Sev</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((w) =>
                    w.id === editId ? (
                      <tr key={w.id}>
                        <td className="!pt-3">
                          <span className="record-id">#{String(w.id).padStart(4, "0")}</span>
                        </td>
                        <td colSpan={2}>
                          <h3 className="mb-3 font-display text-sm uppercase tracking-[0.06em] text-maroon">
                            Edit “{w.name}”
                          </h3>
                          <WatchlistForm id={w.id} initial={toFormValues(w)} />
                        </td>
                      </tr>
                    ) : (
                      <tr key={w.id}>
                        <td className="!pt-3">
                          <span className="record-id">#{String(w.id).padStart(4, "0")}</span>
                        </td>
                        <td className="min-w-0">
                          <h3 className="mb-2 font-semibold text-ink">{w.name}</h3>
                          <dl className="flex flex-col gap-2">
                            <Row label="Categories">
                              {w.categories.length === 0 ? (
                                <span className="text-muted">All</span>
                              ) : (
                                w.categories.map((c) => {
                                  const meta = CATEGORY_META[c as Category];
                                  return (
                                    <Chip key={c} color={meta?.color}>
                                      {meta?.label ?? c}
                                    </Chip>
                                  );
                                })
                              )}
                            </Row>
                            <Row label="States">
                              {w.states.length === 0 ? (
                                <span className="text-muted">Anywhere</span>
                              ) : (
                                w.states.map((c) => (
                                  <Chip key={c}>
                                    <abbr title={stateLabel(c)} className="num no-underline">
                                      {c}
                                    </abbr>
                                  </Chip>
                                ))
                              )}
                            </Row>
                            <Row label="Keywords">
                              {w.keywords.length === 0 ? (
                                <span className="text-muted">Any</span>
                              ) : (
                                w.keywords.map((k) => <Chip key={k}>{k}</Chip>)
                              )}
                            </Row>
                          </dl>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Link
                              href={watchlistMapHref(w)}
                              className={BTN_SECONDARY}
                              title={
                                w.states.length || w.keywords.length
                                  ? "The map filters by category and severity only"
                                  : undefined
                              }
                            >
                              View on map
                            </Link>
                            <Link href={`/watchlists?edit=${w.id}`} className={BTN_SECONDARY} aria-label={`Edit watchlist ${w.name}`}>
                              Edit
                            </Link>
                            <DeleteWatchlistButton id={w.id} name={w.name} />
                          </div>
                        </td>
                        <td className="num whitespace-nowrap !pt-3">
                          <span className={`stamp stamp-flat ${w.min_severity >= 4 ? "stamp-danger" : "stamp-teal"}`}>
                            S≥{w.min_severity}
                          </span>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>कुल / Total</td>
                    <td className="num">{list.length}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        <FormSlip as="aside" formNo="BP-04" title="New watchlist / नई सूची" className="h-fit">
          <WatchlistForm />
        </FormSlip>
      </div>
    </div>
  );
}
