import type { Metadata } from "next";
import Link from "next/link";
import { BriefContent } from "@/components/brief/brief-content";
import { Chakra } from "@/components/hud/ornaments";
import { TopEvents } from "@/components/brief/top-events";
import { getLang } from "@/lib/i18n/server";
import { formatIst, formatIstDate } from "@/lib/stats/format";
import { fetchTopEvents, fetchIndiaBriefs } from "./queries";

export const metadata: Metadata = { title: "India Brief — Bharat Pulse" };

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
  const [{ brief, archive, error }, lang] = await Promise.all([fetchIndiaBriefs(selectedId), getLang()]);
  // Hindi edition when the UI is in Hindi and a translation exists.
  const hindi = lang === "hi" && Boolean(brief?.content_hi);

  const now = new Date();
  const periodStart = brief?.period_start ?? new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const periodEnd = brief?.period_end ?? now.toISOString();
  const top = await fetchTopEvents(periodStart, periodEnd);
  const isArchived = brief !== null && selectedId !== null && archive.some((a) => a.period_start > brief.period_start);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 pt-6">
        <header className="border-y-[3px] border-double border-maroon py-3 text-center">
          <p className="label flex items-center justify-center gap-3">
            <span>दैनिक भारत सार</span>
            <span aria-hidden>·</span>
            <time dateTime={periodEnd}>{formatIstDate(periodEnd)} IST</time>
          </p>
          <p className="mt-1 font-display text-2xl uppercase tracking-[0.08em] text-maroon sm:text-4xl">
            Bharat Pulse <span className="normal-case tracking-normal">· भारत पल्स</span>
          </p>
          <h1 className="font-display text-lg text-ink">India Brief</h1>
          <div className="mx-auto mt-2 flex max-w-md items-center gap-3 text-gold" aria-hidden>
            <span className="h-px flex-1 bg-gold" />
            <Chakra className="h-6 w-6" />
            <span className="h-px flex-1 bg-gold" />
          </div>
          <p className="mx-auto mt-2 max-w-xl text-sm text-ink-soft">
            {lang === "hi"
              ? "भारत में पिछले 24 घंटों की प्रमुख घटनाओं का दैनिक सारांश।"
              : "A daily summary of the last 24 hours across India: disasters, security, governance, economy."}
          </p>
        </header>
      </div>
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 pb-6 pt-6 lg:grid-cols-[1fr_16rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {error && (
            <p role="alert" className="border border-danger/40 border-l-[3px] bg-danger/10 px-3 py-2 text-sm">
              Couldn&apos;t load briefs: {error}
            </p>
          )}

          {selectedId !== null && !brief && !error && (
            <p className="border border-border bg-surface-2 px-3 py-2 text-sm text-ink-soft">
              That brief wasn&apos;t found.{" "}
              <Link href="/brief" className="text-accent underline">
                Show the latest brief
              </Link>
              .
            </p>
          )}

          {brief ? (
            <article className="ledger-panel" aria-labelledby="brief-title">
              <header className="ledger-header">
                <h2 id="brief-title" className="ledger-title !whitespace-normal">
                  <span className="acct">खाता 01 ·</span>Dispatch
                </h2>
                <p className="label">
                  {hindi ? <span className="stamp stamp-teal stamp-flat mr-2">हिन्दी संस्करण</span> : null}
                  <span className="num !tracking-normal">
                    {formatIst(brief.period_start)} – {formatIst(brief.period_end)}
                  </span>
                </p>
              </header>
              <div className="bg-surface bg-none px-5 py-5 sm:px-8">
                <div lang={hindi ? "hi" : "en"}>
                  <BriefContent content={hindi ? brief.content_hi! : brief.content} />
                </div>
                <div aria-hidden className="ornament-divider !mt-6" />
                <p className="text-xs text-muted">
                  Generated{" "}
                  <time className="num" dateTime={brief.created_at}>
                    {formatIst(brief.created_at)}
                  </time>
                  {brief.model && (
                    <>
                      {" · Model: "}
                      <span className="num">{brief.model}</span>
                    </>
                  )}
                  {isArchived && (
                    <>
                      {" · "}
                      <Link href="/brief" className="text-accent underline">
                        Back to latest
                      </Link>
                    </>
                  )}
                </p>
                {hindi && (
                  <p className="mt-1 text-xs text-muted">मशीन अनुवाद (Bhashini / Sarvam) · मूल अंग्रेज़ी में</p>
                )}
              </div>
            </article>
          ) : (
            !error &&
            selectedId === null && (
              <section className="ledger-panel px-5 py-6 text-center">
                <div aria-hidden className="ornament-divider mx-auto w-48 max-w-full" />
                <h2 className="font-display text-base text-maroon">No brief yet</h2>
                <p className="label mt-1 !normal-case !tracking-normal">इस बही में अभी कोई प्रविष्टि नहीं</p>
                <p className="mx-auto mt-3 max-w-[60ch] text-sm text-ink-soft">
                  An India Brief is generated once a day from the latest events — written by an AI model when one is
                  configured, otherwise as an automatic digest of the top stories. The first brief will appear here
                  after the daily job runs. In the meantime, here are the most severe events from the last 24 hours.
                </p>
              </section>
            )
          )}

          <section aria-labelledby="top-events-title" className="ledger-panel">
            <header className="ledger-header">
              <h2 id="top-events-title" className="ledger-title !whitespace-normal">
                <span className="acct">खाता 02 ·</span>Top events in this period
              </h2>
              <p className="label !normal-case !tracking-normal">
                10 highest severity, {formatIst(periodStart)} – {formatIst(periodEnd)}
              </p>
            </header>
            {top.error ? (
              <p role="alert" className="p-4 text-sm text-danger">
                Couldn&apos;t load events: {top.error}
              </p>
            ) : (
              <TopEvents events={top.events} lang={lang} />
            )}
          </section>
        </div>

        <aside aria-labelledby="archive-title" className="ledger-panel h-fit lg:mt-0">
          <header className="ledger-header">
            <h2 id="archive-title" className="ledger-title !whitespace-normal">
              <span className="acct">खाता 03 ·</span>Previous briefs
            </h2>
          </header>
          {archive.length === 0 ? (
            <p className="p-3 text-sm text-muted">No earlier briefs yet.</p>
          ) : (
            <ul className="m-0 list-none p-0 text-sm">
              {archive.map((a, n) => (
                <li key={a.id}>
                  <Link href={`/brief?id=${a.id}`} className="ledger-row !items-start text-ink-soft hover:text-maroon">
                    <span className="record-id mt-0.5">#{String(n + 1).padStart(4, "0")}</span>
                    <span>
                      <time dateTime={a.period_end}>{formatIstDate(a.period_end)}</time>
                      <span className="block text-xs text-muted">
                        {formatIstDate(a.period_start)} – {formatIstDate(a.period_end)}
                      </span>
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
