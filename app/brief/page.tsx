import type { Metadata } from "next";
import Link from "next/link";
import { BriefContent } from "@/components/brief/brief-content";
import { TopEvents } from "@/components/brief/top-events";
import { formatUtc, formatUtcDate } from "@/lib/stats/format";
import { fetchTopEvents, fetchWorldBriefs } from "./queries";

export const metadata: Metadata = { title: "World Brief — Pulse" };

function parseId(value: string | string[] | undefined): number | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}

export default async function BriefPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const selectedId = parseId((await searchParams).id);
  const { brief, archive, error } = await fetchWorldBriefs(selectedId);

  const now = new Date();
  const periodStart = brief?.period_start ?? new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const periodEnd = brief?.period_end ?? now.toISOString();
  const top = await fetchTopEvents(periodStart, periodEnd);
  const isArchived = brief !== null && selectedId !== null && archive.some((a) => a.period_start > brief.period_start);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[1fr_16rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <header>
            <h1 className="glow text-lg font-bold uppercase tracking-[0.25em] text-accent">World Brief</h1>
            <p className="text-sm text-muted">A daily summary of what happened around the world.</p>
          </header>

          {error && (
            <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
              Couldn&apos;t load briefs: {error}
            </p>
          )}

          {selectedId !== null && !brief && !error && (
            <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
              That brief wasn&apos;t found.{" "}
              <Link href="/brief" className="text-accent hover:underline">
                Show the latest brief
              </Link>
              .
            </p>
          )}

          {brief ? (
            <article className="hud-panel p-5" aria-labelledby="brief-title">
              <header className="mb-4 border-b border-border pb-3">
                <h2 id="brief-title" className="font-semibold">
                  {formatUtc(brief.period_start)} – {formatUtc(brief.period_end)}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Generated <time dateTime={brief.created_at}>{formatUtc(brief.created_at)}</time>
                  {brief.model && (
                    <>
                      {" "}
                      · Model: <span className="font-mono">{brief.model}</span>
                    </>
                  )}
                  {isArchived && (
                    <>
                      {" · "}
                      <Link href="/brief" className="text-accent hover:underline">
                        Back to latest
                      </Link>
                    </>
                  )}
                </p>
              </header>
              <BriefContent content={brief.content} />
            </article>
          ) : (
            !error &&
            selectedId === null && (
              <section className="rounded-lg border border-dashed border-border bg-surface p-5">
                <h2 className="font-semibold">No brief yet</h2>
                <p className="mt-2 text-sm text-muted">
                  A World Brief is generated once a day from the latest events — written by an AI model when one is
                  configured, otherwise as an automatic digest of the top stories. The first brief will appear here
                  after the daily job runs.
                </p>
                <p className="mt-2 text-sm text-muted">
                  In the meantime, here are the most severe events from the last 24 hours.
                </p>
              </section>
            )
          )}

          <section aria-labelledby="top-events-title" className="hud-panel p-5">
            <h2 id="top-events-title" className="font-semibold">
              Top events in this period
            </h2>
            <p className="mb-2 text-xs text-muted">
              10 highest-severity events, {formatUtc(periodStart)} – {formatUtc(periodEnd)}
            </p>
            {top.error ? (
              <p role="alert" className="text-sm text-danger">
                Couldn&apos;t load events: {top.error}
              </p>
            ) : (
              <TopEvents events={top.events} />
            )}
          </section>
        </div>

        <aside aria-labelledby="archive-title" className="lg:pt-14">
          <h2 id="archive-title" className="hud-label mb-2 !text-accent">
            Previous briefs
          </h2>
          {archive.length === 0 ? (
            <p className="text-sm text-muted">No earlier briefs yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {archive.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/brief?id=${a.id}`}
                    className="block rounded-md border border-transparent px-3 py-2 text-muted hover:border-border hover:bg-surface hover:text-foreground"
                  >
                    <time dateTime={a.period_end}>{formatUtcDate(a.period_end)}</time>
                    <span className="block text-xs">
                      {formatUtcDate(a.period_start)} – {formatUtcDate(a.period_end)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
