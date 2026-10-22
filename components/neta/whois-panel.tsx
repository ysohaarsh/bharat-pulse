"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useLang } from "@/components/i18n/lang-provider";
import { FOCUS_RING } from "@/components/feed/labels";
import { ESAKSHI_DASHBOARD, mynetaSearch, prsMpTrack } from "@/lib/neta/links";
import { parseWhois, type Whois, type WhoisBoundary, type WhoisRepresentative } from "@/lib/neta/whois";
import { stateLabel } from "@/lib/stats/format";
import { createClient } from "@/lib/supabase/client";

export interface PickedPoint {
  lat: number;
  lng: number;
}

type State = { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "done"; whois: Whois };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-border px-3 py-2 last:border-b-0">
      <dt className="hud-label !text-[9px]">{label}</dt>
      <dd className="mt-0.5 text-xs text-foreground">{children}</dd>
    </div>
  );
}

/** "Ward 25 · Vinayaka Layout (Bengaluru West)", with the Kannada name appended when the data has it. */
function wardLine(ward: WhoisBoundary, lang: string): string {
  const meta = ward.meta ?? {};
  const num = meta.number ?? ward.code.split(":").pop();
  const corp = typeof meta.corporation === "string" ? meta.corporation : null;
  const kn = typeof meta.name_kn === "string" && meta.name_kn ? ` / ${meta.name_kn}` : "";
  const label = lang === "hi" ? "वार्ड" : "Ward";
  return `${label} ${String(num)} · ${ward.name}${kn}${corp ? ` (${corp})` : ""}`;
}

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`text-accent hover:underline ${FOCUS_RING}`}>
      {children} ↗
    </a>
  );
}

function RepCard({ rep }: { rep: WhoisRepresentative }) {
  const { t } = useLang();
  return (
    <div className="mt-1 flex gap-2">
      {rep.photo_url && (
        // External, unoptimised portrait from sansad.in.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={rep.photo_url} alt="" width={44} height={52} className="h-[52px] w-[44px] shrink-0 border border-border object-cover" />
      )}
      <div className="min-w-0 space-y-0.5">
        <p className="font-sans text-sm font-semibold text-foreground">{rep.name}</p>
        <p className="text-[11px] text-muted">
          {rep.party_short && <span className="text-accent">{rep.party_short}</span>}
          {rep.party && rep.party !== rep.party_short && <> · {rep.party}</>}
        </p>
        {rep.email && (
          <p className="truncate text-[11px]">
            <a href={`mailto:${rep.email}`} className={`text-foreground hover:text-accent ${FOCUS_RING}`}>
              {rep.email}
            </a>
          </p>
        )}
        <ul className="space-y-0.5 pt-1 text-[11px]">
          {rep.profile_url && (
            <li>
              <ExtLink href={rep.profile_url}>{t("whoProfile")}</ExtLink>
            </li>
          )}
          <li>
            <ExtLink href={mynetaSearch(rep.name)}>{t("whoAffidavit")}</ExtLink>
          </li>
          {rep.house === "ls" && (
            <>
              <li>
                <ExtLink href={prsMpTrack(rep.name)}>{t("whoTrackRecord")}</ExtLink>
              </li>
              <li>
                <ExtLink href={ESAKSHI_DASHBOARD}>{t("whoFunds")}</ExtLink>
              </li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}

/**
 * "Who represents this place?" — state, district, Lok Sabha seat + MP, assembly seat, via the
 * `whois` PostGIS RPC. Opens for a map click, the viewer's location, or a pincode.
 */
export function WhoisPanel({
  point,
  onPoint,
  onClose,
}: {
  point: PickedPoint | null;
  onPoint: (p: PickedPoint, zoom?: number) => void;
  onClose: () => void;
}) {
  const { t, lang } = useLang();
  const [state, setState] = useState<State>({ status: "idle" });
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    if (!point) return;
    let cancelled = false;
    // Async so the loading state isn't set synchronously inside the effect.
    queueMicrotask(() => !cancelled && setState({ status: "loading" }));
    // Async so a misconfigured client (missing env) becomes an error state, not a crashed page.
    Promise.resolve()
      .then(() => createClient().rpc("whois", { p_lat: point.lat, p_lng: point.lng }))
      .then(({ data, error }) => {
        if (cancelled) return;
        const whois = error ? null : parseWhois(data);
        setState(whois ? { status: "done", whois } : { status: "error", message: error?.message ?? "Lookup failed" });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: "error", message: err instanceof Error ? err.message : "Lookup failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [point]);

  const locate = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => onPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 10),
      () => setPinError("Location unavailable"),
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  };

  const lookupPin = async (e: FormEvent) => {
    e.preventDefault();
    setPinError(null);
    const res = await fetch(`/api/pincode?pin=${encodeURIComponent(pin.trim())}`);
    const body = (await res.json()) as { lat?: number; lng?: number; error?: string };
    if (!res.ok || body.lat == null || body.lng == null) setPinError(body.error ?? "Not found");
    else onPoint({ lat: body.lat, lng: body.lng }, 8);
  };

  const w = state.status === "done" ? state.whois : null;
  const outside = w && !w.state && !w.pc;

  return (
    <section
      aria-label={t("whoTitle")}
      className="pointer-events-auto flex max-h-full w-[300px] max-w-[calc(100vw-2rem)] flex-col border border-border-strong bg-background/95 shadow-[0_0_24px_rgb(0_255_136/0.12)] backdrop-blur"
    >
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="hud-label !text-accent">{t("whoTitle")}</h2>
        <button type="button" onClick={onClose} aria-label={t("close")} className={`text-muted hover:text-accent ${FOCUS_RING}`}>
          ✕
        </button>
      </header>

      <div className="space-y-2 border-b border-border px-3 py-2">
        <p className="text-[11px] leading-snug text-muted">{t("whoHint")}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={locate}
            className={`border border-border px-2 py-1 text-[11px] text-accent hover:border-accent ${FOCUS_RING}`}
          >
            ◎ {t("whoUseLocation")}
          </button>
          <form onSubmit={lookupPin} className="flex min-w-0 flex-1 gap-1">
            <label className="sr-only" htmlFor="whois-pin">
              {t("whoPincode")}
            </label>
            <input
              id="whois-pin"
              inputMode="numeric"
              pattern="[1-9][0-9]{5}"
              maxLength={6}
              placeholder={t("whoPincode")}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className={`w-full min-w-0 border border-border bg-surface px-2 py-1 text-[11px] text-foreground ${FOCUS_RING}`}
            />
            <button type="submit" className={`border border-border px-2 py-1 text-[11px] text-accent hover:border-accent ${FOCUS_RING}`}>
              {t("whoLookup")}
            </button>
          </form>
        </div>
        {pinError && (
          <p role="alert" className="text-[11px] text-danger">
            {pinError}
          </p>
        )}
      </div>

      <div className="min-h-0 overflow-y-auto" aria-live="polite">
        {state.status === "loading" && <p className="blink px-3 py-3 text-[11px] text-accent">{t("whoLoading")}</p>}
        {state.status === "error" && (
          <p role="alert" className="px-3 py-3 text-[11px] text-danger">
            {state.message}
          </p>
        )}
        {outside && <p className="px-3 py-3 text-[11px] text-muted">{t("whoNothing")}</p>}
        {w && !outside && (
          <dl>
            {w.state && <Row label={t("whoState")}>{stateLabel(w.state.code, lang)}</Row>}
            {w.district && <Row label={t("whoDistrict")}>{w.district.name}</Row>}
            {w.pc && (
              <Row label={t("whoMp")}>
                <span className="text-muted">{w.pc.name}</span>
                {w.mp ? <RepCard rep={w.mp} /> : <p className="mt-1 text-warn">{t("whoVacant")}</p>}
              </Row>
            )}
            {w.ac && (
              <Row label={t("whoMla")}>
                <span className="text-muted">{lang === "hi" && w.ac.name_hi ? w.ac.name_hi : w.ac.name}</span>
                {w.mla ? (
                  <RepCard rep={w.mla} />
                ) : (
                  <p className="mt-1 text-[11px]">
                    <ExtLink href={mynetaSearch(w.ac.name)}>{t("whoAffidavit")}</ExtLink>
                  </p>
                )}
              </Row>
            )}
            {w.ward && (
              <Row label={t("whoWard")}>
                {wardLine(w.ward, lang)}
                {w.councillor ? <RepCard rep={w.councillor} /> : <p className="mt-1 text-[11px] text-warn">{t("whoWardPending")}</p>}
              </Row>
            )}
            <div className="px-3 py-2">
              <Link
                href={`/report?lat=${w.lat.toFixed(5)}&lng=${w.lng.toFixed(5)}`}
                className={`inline-block border border-border-strong px-2 py-1 text-[11px] uppercase tracking-wider text-accent hover:bg-accent hover:text-black ${FOCUS_RING}`}
              >
                + {t("whoReportHere")}
              </Link>
              <p className="mt-2 text-[9px] leading-relaxed text-muted">{t("whoSources")}</p>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}
