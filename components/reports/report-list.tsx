"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Notice } from "@/components/auth/notice";
import { Lotus } from "@/components/hud/ornaments";
import { useLang } from "@/components/i18n/lang-provider";
import { stateShort } from "@/lib/india/states";
import { isReportKind, REPORT_KIND_LABEL } from "@/lib/reports/kinds";
import { formatIst } from "@/lib/stats/format";
import { createClient } from "@/lib/supabase/client";

export interface ReportItem {
  id: number;
  user_id: string;
  kind: string;
  description: string;
  status: string;
  upvotes: number;
  state: string | null;
  district: string | null;
  photo_url: string | null;
  created_at: string;
}

const BTN = "chip !rounded-sm !py-0.5 disabled:opacity-50";

export function ReportList({ reports, userId, votedIds }: { reports: ReportItem[]; userId: string | null; votedIds: number[] }) {
  const { t, lang } = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (id: number, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(id);
    setError(null);
    const { error } = await fn();
    setBusy(null);
    if (error) setError(error.message);
    else router.refresh();
  };

  if (reports.length === 0)
    return (
      <div className="ledger-panel flex flex-col items-center gap-1 px-4 py-8 text-center">
        <Lotus className="h-5 w-8 text-gold" />
        <p className="font-display text-sm uppercase tracking-[0.06em] text-maroon">कोई शिकायत दर्ज नहीं</p>
        <p className="text-sm text-muted">No reports on the register yet.</p>
      </div>
    );
  return (
    <>
      {error && (
        <div className="mb-2">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      <div className="ledger-panel">
        <ul>
        {reports.map((r, idx) => {
          const label = isReportKind(r.kind) ? REPORT_KIND_LABEL[r.kind] : null;
          const voted = votedIds.includes(r.id);
          const own = userId === r.user_id;
          return (
            <li key={r.id} className="ledger-row !items-start">
              <span className="record-id pt-0.5">#{String(r.id || idx + 1).padStart(4, "0")}</span>
              {r.photo_url && (
                // User-uploaded photo from Supabase Storage.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.photo_url} alt="" loading="lazy" className="h-16 w-16 shrink-0 border border-border-strong object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="font-semibold text-accent">
                    {label?.icon} {label ? label[lang] : r.kind}
                  </span>
                  <span className={`stamp ${r.status === "resolved" ? "stamp-ok" : "stamp-warn"}`}>
                    {r.status === "resolved" ? t("reportResolved") : t("reportOpen")}
                  </span>
                  {r.state && (
                    <span className="text-muted">
                      {r.district ? `${r.district}, ` : ""}
                      {stateShort(r.state)}
                    </span>
                  )}
                  <time dateTime={r.created_at} className="num ml-auto text-[11px] text-muted">
                    {formatIst(r.created_at)}
                  </time>
                </p>
                <p className="mt-0.5 text-sm text-ink">{r.description}</p>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    disabled={!userId || busy === r.id}
                    aria-pressed={voted}
                    onClick={() =>
                      act(r.id, () =>
                        voted
                          ? createClient().from("report_votes").delete().eq("report_id", r.id).eq("user_id", userId!)
                          : createClient().from("report_votes").insert({ report_id: r.id }),
                      )
                    }
                    className={`${BTN} ${voted ? "is-on" : ""}`}
                  >
                    ✋ {t("reportUpvote")} · {r.upvotes}
                  </button>
                  {own && r.status !== "resolved" && (
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => act(r.id, () => createClient().from("reports").update({ status: "resolved" }).eq("id", r.id))}
                      className={BTN}
                    >
                      ✓ {t("reportMarkResolved")}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        </ul>
        <div className="ledger-total">
          <span>कुल / Total</span>
          <span className="num">{reports.length}</span>
        </div>
      </div>
    </>
  );
}
