import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/components/auth/session";
import { BTN_SECONDARY } from "@/components/auth/styles";
import { DeleteWatchlistButton } from "@/components/watchlists/delete-button";
import { WatchlistForm } from "@/components/watchlists/watchlist-form";
import { CATEGORY_META } from "@/lib/categories";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/types";
import { watchlistMapHref } from "@/lib/watchlists/links";
import { countryName, toFormValues } from "@/lib/watchlists/schema";

export const metadata: Metadata = { title: "Watchlists — Pulse" };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function Chip({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground">
      {color && <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
      <dt className="w-24 shrink-0 text-xs text-muted">{label}</dt>
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
    .select("id, name, countries, categories, keywords, min_severity, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const list = watchlists ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[1fr_22rem]">
        <section aria-labelledby="wl-heading" className="flex min-w-0 flex-col gap-4">
          <header>
            <h1 id="wl-heading" className="glow text-lg font-bold uppercase tracking-[0.25em] text-accent">
              Watchlists
            </h1>
            <p className="text-sm text-muted">
              New events matching a watchlist show up in your{" "}
              <Link href="/alerts" className="text-accent hover:underline">
                alerts
              </Link>
              .
            </p>
          </header>

          {error && (
            <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
              Couldn&apos;t load watchlists: {error.message}
            </p>
          )}

          {!error && list.length === 0 && (
            <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
              No watchlists yet. Create one to start getting alerts.
            </p>
          )}

          <ul className="flex flex-col gap-3">
            {list.map((w) =>
              w.id === editId ? (
                <li key={w.id} className="rounded-lg border border-accent/40 bg-surface p-4">
                  <h2 className="mb-3 text-sm font-semibold">Edit “{w.name}”</h2>
                  <WatchlistForm id={w.id} initial={toFormValues(w)} />
                </li>
              ) : (
                <li key={w.id} className="hud-panel p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <h2 className="font-semibold">{w.name}</h2>
                    <span className="shrink-0 font-mono text-[11px] text-muted">sev ≥ {w.min_severity}</span>
                  </div>
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
                    <Row label="Countries">
                      {w.countries.length === 0 ? (
                        <span className="text-muted">Anywhere</span>
                      ) : (
                        w.countries.map((c) => (
                          <Chip key={c}>
                            <abbr title={countryName(c)} className="font-mono no-underline">
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
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Link
                      href={watchlistMapHref(w)}
                      className={BTN_SECONDARY}
                      title={
                        w.countries.length || w.keywords.length
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
                </li>
              ),
            )}
          </ul>
        </section>

        <aside aria-labelledby="new-wl-heading" className="h-fit hud-panel p-4">
          <h2 id="new-wl-heading" className="mb-3 font-semibold">
            New watchlist
          </h2>
          <WatchlistForm />
        </aside>
      </div>
    </div>
  );
}
