"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { FormSlip } from "@/components/auth/form-slip";
import { Notice } from "@/components/auth/notice";
import { BTN_PRIMARY, FIELD_ERROR, INPUT, LABEL } from "@/components/auth/styles";
import { useLang } from "@/components/i18n/lang-provider";
import { REPORT_KIND_LABEL, REPORT_KINDS, REPORT_PHOTO_BUCKET, type ReportKind } from "@/lib/reports/kinds";
import { photoPath, photoProblem, reportSchema } from "@/lib/reports/schema";
import { createClient } from "@/lib/supabase/client";

const PickMap = dynamic(() => import("@/components/map/pick-map"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-xs text-muted">नक्शा खुल रहा है / Loading map…</div>,
});

type Point = { lat: number; lng: number };

/**
 * Civic report form. Writes straight to Supabase from the browser: the photo goes to the
 * `report-photos` bucket under the reporter's own folder, then the row is inserted. RLS, column
 * grants and a per-user daily cap in the database are the real guards.
 */
export function ReportForm({ userId, initialPoint }: { userId: string | null; initialPoint: Point | null }) {
  const { t, lang } = useLang();
  const router = useRouter();
  const id = useId();
  const [kind, setKind] = useState<ReportKind>("pothole");
  const [description, setDescription] = useState("");
  const [point, setPoint] = useState<Point | null>(initialPoint);
  const [photo, setPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (pos) => setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setErrors((e) => ({ ...e, location: "Location unavailable — click the map instead" })),
      { enableHighAccuracy: true, timeout: 10_000 },
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    const parsed = reportSchema.safeParse({ kind, description, lat: point?.lat, lng: point?.lng });
    const photoError = photoProblem(photo);
    if (!parsed.success || photoError) {
      const next: Record<string, string> = {};
      for (const issue of parsed.success ? [] : parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        next[key === "lat" || key === "lng" ? "location" : key] ??= issue.message;
      }
      if (photoError) next.photo = photoError;
      setErrors(next);
      return;
    }

    setBusy(true);
    setErrors({});
    const supabase = createClient();
    let photo_path: string | null = null;
    if (photo) {
      photo_path = photoPath(userId, photo.type, crypto.randomUUID());
      const { error } = await supabase.storage.from(REPORT_PHOTO_BUCKET).upload(photo_path, photo, { contentType: photo.type });
      if (error) {
        setBusy(false);
        setErrors({ photo: error.message });
        return;
      }
    }
    const { error } = await supabase.from("reports").insert({ ...parsed.data, photo_path });
    setBusy(false);
    if (error) {
      setErrors({ form: error.message.includes("daily report limit") ? "You've hit today's limit of 10 reports." : error.message });
      return;
    }
    setDone(true);
    setDescription("");
    setPhoto(null);
    router.refresh();
  };

  return (
    <FormSlip formNo="BP-07" title="Civic report / नागरिक शिकायत">
      <form onSubmit={submit} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-h-[320px] flex-col border border-border-strong bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2 px-3 py-1.5">
            <span className="text-xs text-ink-soft">
              <span className="label mr-1.5">स्थान / {t("reportLocation")}</span>
              {point ? (
                <span className="num text-accent">
                  {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                </span>
              ) : (
                t("reportPickHint")
              )}
            </span>
            <button type="button" onClick={locate} className="btn-ghost !px-2 !py-0.5 !text-xs">
              ◎ {t("whoUseLocation")}
            </button>
          </div>
          <div className="relative min-h-[260px] flex-1">
            <PickMap value={point} onChange={setPoint} />
          </div>
          {errors.location && <p className={`${FIELD_ERROR} px-3 pb-2`}>{errors.location}</p>}
        </div>

        <div className="flex flex-col gap-3">
          {!userId ? (
            <Notice kind="warn" label="साइन इन / SIGN IN">
              <Link href="/login?next=/report" className="font-semibold underline">
                {t("reportSignIn")}
              </Link>
            </Notice>
          ) : null}

          <div>
            <label htmlFor={`${id}-kind`} className={LABEL}>
              {t("reportKind")}
            </label>
            <select id={`${id}-kind`} value={kind} onChange={(e) => setKind(e.target.value as ReportKind)} className={INPUT}>
              {REPORT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {REPORT_KIND_LABEL[k].icon} {REPORT_KIND_LABEL[k][lang]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${id}-desc`} className={LABEL}>
              {t("reportDescription")}
            </label>
            <textarea
              id={`${id}-desc`}
              rows={4}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-invalid={errors.description ? true : undefined}
              className={INPUT}
            />
            {errors.description && <p className={FIELD_ERROR}>{errors.description}</p>}
          </div>

          <div>
            <label htmlFor={`${id}-photo`} className={LABEL}>
              {t("reportPhoto")}
            </label>
            <input
              id={`${id}-photo`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="block w-full border border-dashed border-border-strong bg-surface-2 p-2 text-xs text-ink-soft file:mr-2 file:cursor-pointer file:rounded-sm file:border file:border-maroon-deep file:bg-maroon file:px-2 file:py-1 file:text-xs file:font-semibold file:text-cream"
            />
            {errors.photo && <p className={FIELD_ERROR}>{errors.photo}</p>}
          </div>

          {errors.form && <Notice kind="error">{errors.form}</Notice>}
          {done && <Notice kind="ok">{t("reportThanks")}</Notice>}
          <button type="submit" disabled={!userId || busy} className={BTN_PRIMARY}>
            {busy ? "…" : t("reportSubmit")}
          </button>
        </div>
      </form>
    </FormSlip>
  );
}
