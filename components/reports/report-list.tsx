"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FOCUS } from "@/components/auth/styles";
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

const BTN = `border border-border px-2 py-0.5 text-[11px] hover:border-accent hover:text-accent disabled:opacity-50 ${FOCUS}`;

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

  if (reports.length === 0) return <p className="text-sm text-muted">—</p>;
  return (
    <>
      {error && (
        <p role="alert" className="mb-2 text-xs text-danger">
          {error}
        </p>
      )}
      <ul className="divide-y divide-border border border-border">
        {reports.map((r) => {
          const label = isReportKind(r.kind) ? REPORT_KIND_LABEL[r.kind] : null;
          const voted = votedIds.includes(r.id);
          const own = userId === r.user_id;
          return (
            <li key={r.id} className="flex gap-3 px-3 py-2">
              {r.photo_url && (
                // User-uploaded photo from Supabase Storage.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.photo_url} alt="" loading="lazy" className="h-16 w-16 shrink-0 border border-border object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 text-[11px]">
                  <span className="text-accent">
                    {label?.icon} {label ? label[lang] : r.kind}
                  </span>
                  <span className={r.status === "resolved" ? "text-muted" : "text-warn"}>
                    {r.status === "resolved" ? t("reportResolved") : t("reportOpen")}
                  </span>
                  {r.state && (
                    <span className="text-muted">
                      {r.district ? `${r.district}, ` : ""}
                      {stateShort(r.state)}
                    </span>
                  )}
                  <time dateTime={r.created_at} className="ml-auto text-muted">
                    {formatIst(r.created_at)}
                  </time>
                </p>
                <p className="mt-0.5 font-sans text-sm text-foreground">{r.description}</p>
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
                    className={`${BTN} ${voted ? "border-accent text-accent" : "text-muted"}`}
                  >
                    ✋ {t("reportUpvote")} · {r.upvotes}
                  </button>
                  {own && r.status !== "resolved" && (
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => act(r.id, () => createClient().from("reports").update({ status: "resolved" }).eq("id", r.id))}
                      className={`${BTN} text-muted`}
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
    </>
  );
}
