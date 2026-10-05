import type { Metadata } from "next";
import { getCurrentUser } from "@/components/auth/session";
import { ReportForm } from "@/components/reports/report-form";
import { ReportList, type ReportItem } from "@/components/reports/report-list";
import { SUPABASE_URL } from "@/lib/env";
import { t } from "@/lib/i18n/dict";
import { getLang } from "@/lib/i18n/server";
import { reportPhotoUrl } from "@/lib/reports/kinds";
import { pointFromParams } from "@/lib/reports/schema";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Report a civic issue — Bharat Pulse" };

async function recentReports(userId: string | null): Promise<{ reports: ReportItem[]; votedIds: number[] }> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("reports")
      .select("id, user_id, kind, description, status, upvotes, state, district, photo_path, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    const reports = (data ?? []).map(({ photo_path, ...r }) => ({ ...r, photo_url: reportPhotoUrl(SUPABASE_URL(), photo_path) }));
    let votedIds: number[] = [];
    if (userId && reports.length) {
      const { data: votes } = await supabase
        .from("report_votes")
        .select("report_id")
        .eq("user_id", userId)
        .in("report_id", reports.map((r) => r.id));
      votedIds = (votes ?? []).map((v) => v.report_id);
    }
    return { reports, votedIds };
  } catch {
    return { reports: [], votedIds: [] };
  }
}

export default async function ReportPage({ searchParams }: PageProps<"/report">) {
  const params = await searchParams;
  const [user, lang] = await Promise.all([getCurrentUser(), getLang()]);
  const { reports, votedIds } = await recentReports(user?.id ?? null);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
        <header>
          <h1 className="glow text-lg font-bold uppercase tracking-[0.25em] text-accent">{t(lang, "reportTitle")}</h1>
          <p className="max-w-2xl text-sm text-muted">{t(lang, "reportIntro")}</p>
        </header>
        <ReportForm userId={user?.id ?? null} initialPoint={pointFromParams(params.lat, params.lng)} />
        <section aria-labelledby="recent-reports">
          <h2 id="recent-reports" className="hud-label mb-2 !text-accent">
            {t(lang, "reportRecent")}
          </h2>
          <ReportList reports={reports} userId={user?.id ?? null} votedIds={votedIds} />
        </section>
      </div>
    </div>
  );
}
