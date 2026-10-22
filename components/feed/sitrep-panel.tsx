"use client";

import { CATEGORY_META } from "@/lib/categories";
import type { Sitrep } from "@/lib/events/sitrep";
import { aqiBand } from "@/lib/india/aqi";
import { stateShort } from "@/lib/india/states";
import { displayTitle } from "@/lib/i18n/display";
import type { Vitals } from "@/lib/metrics/vitals";
import { stateLabel } from "@/lib/stats/format";
import type { Category } from "@/lib/types";
import { HudPanel } from "@/components/hud/hud-panel";
import { IstClock, IstDate } from "@/components/hud/ist-clock";
import { useLang } from "@/components/i18n/lang-provider";
import { relativeTime } from "./event-card";
import { FOCUS_RING, SOURCE_LABEL } from "./labels";

const THREAT_COLOR: Record<Sitrep["threatLabel"], string> = {
  LOW: "var(--teal)",
  GUARDED: "var(--ok)",
  ELEVATED: "var(--warn)",
  HIGH: "var(--maroon)",
  SEVERE: "var(--danger)",
};

const SEGMENTS = 20;

/** Attribution for the upstream data providers. */
const CREDITS = [
  { label: "NDMA SACHET", href: "https://sachet.ndma.gov.in" },
  { label: "NCS", href: "https://seismo.gov.in" },
  { label: "CPCB", href: "https://airquality.cpcb.gov.in" },
  { label: "Vidyut PRAVAH", href: "https://vidyutpravah.in" },
  { label: "PIB", href: "https://pib.gov.in" },
  { label: "sansad.in", href: "https://sansad.in" },
  { label: "NASA FIRMS", href: "https://firms.modaps.eosdis.nasa.gov" },
  { label: "OpenStreetMap", href: "https://www.openstreetmap.org/copyright" },
  { label: "DataMeet", href: "https://github.com/datameet/maps" },
];

/** One account in the panel: a small display-face head over a rule, body below. */
function Section({ title, code, children }: { title: string; code?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border-strong px-3 py-3 last:border-b-0">
      <h3 className="ledger-title mb-2 w-full border-b border-border pb-1 !text-[12px]">
        {code && (
          <span aria-hidden className="acct">
            {code}
          </span>
        )}
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Tiny inline SVG sparkline (no chart library on the home page). */
function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 26}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label={label} className="mt-1 h-8 w-full border-b border-border">
      <polyline points={points} fill="none" stroke="var(--teal)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function VitalsSection({ vitals }: { vitals: Vitals }) {
  const { t, lang } = useLang();
  const { power, worstAir, mandi, flights } = vitals;
  const hasAny = power.demand != null || worstAir.length > 0 || mandi.length > 0 || flights != null;
  return (
    <Section title={t("vitals")} code="03">
      {!hasAny && <p className="text-xs text-muted">—</p>}
      {power.demand != null && (
        <div className="mb-3">
          <div className="flex items-baseline justify-between">
            <span className="label">{t("powerDemand")}</span>
            <span className="font-display text-2xl leading-none tabular-nums text-accent">
              {power.demand} <span className="label">GW</span>
            </span>
          </div>
          <Sparkline values={power.history} label={`${t("powerDemand")}, 24h`} />
          <p className="num mt-1 flex justify-between text-[10.5px] text-muted">
            {power.demandYesterday != null && <span>peak yday {power.demandYesterday} GW</span>}
            {power.price != null && (
              <span>
                {t("powerPrice")} ₹{power.price.toFixed(2)}/kWh
              </span>
            )}
          </p>
        </div>
      )}
      {flights && (
        <p className="num mb-3 flex flex-wrap items-baseline justify-between gap-x-2 text-xs" title="OpenSky Network">
          <span className="label">{t("flightVitals")}</span>
          <span>
            <span className="font-semibold text-accent">{flights.total}</span> · {flights.airborne} {t("flightAirborne")} · {flights.ground}{" "}
            {t("flightOnGround")}
          </span>
        </p>
      )}
      {worstAir.length > 0 && (
        <table className="ledger-table mb-3 text-xs">
          <caption className="label pb-1 text-left">{t("worstAir")}</caption>
          <thead>
            <tr>
              <th>{t("dashCity")}</th>
              <th className="num">{t("dashAqi")}</th>
              <th>{t("dashBand")}</th>
            </tr>
          </thead>
          <tbody>
            {worstAir.map((a) => {
              const band = aqiBand(a.aqi);
              return (
                <tr key={a.city}>
                  <td className="!py-1">
                    {a.city}
                    {a.state && <span className="num text-muted"> {stateShort(a.state)}</span>}
                  </td>
                  <td className="num !py-1 font-semibold" title={a.modelled ? "Modelled (CAMS)" : "CPCB station"}>
                    {a.aqi}
                    {a.modelled ? "*" : ""}
                  </td>
                  <td className="!py-1 text-[11px]">
                    <span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-ink/25 align-middle" style={{ background: band.color }} />
                    {lang === "hi" ? band.hi : band.label}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {mandi.length > 0 && (
        <table className="ledger-table text-xs">
          <caption className="label pb-1 text-left">{t("mandi")}</caption>
          <thead>
            <tr>
              <th>{t("dashCommodity")}</th>
              <th className="num">{t("dashRate")}</th>
            </tr>
          </thead>
          <tbody>
            {mandi.map((m) => (
              <tr key={m.commodity}>
                <td className="!py-1">{m.commodity}</td>
                <td className="num !py-1">₹{m.price.toLocaleString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

export function SitrepPanel({
  sitrep,
  vitals,
  now,
  windowLabel,
  onSelect,
  onIsolateCategory,
}: {
  sitrep: Sitrep;
  vitals: Vitals;
  now: number;
  windowLabel: string;
  onSelect: (id: number) => void;
  onIsolateCategory: (c: Category) => void;
}) {
  const { t, lang } = useLang();
  const threatColor = THREAT_COLOR[sitrep.threatLabel];
  const lit = Math.round((sitrep.threat / 100) * SEGMENTS);
  const maxCat = Math.max(1, ...sitrep.byCategory.map((c) => c.count));

  return (
    <HudPanel
      as="aside"
      aria-label="India now"
      title={t("panelIndiaNow")}
      code="01"
      right={<span className="label num">WIN {windowLabel}</span>}
      className="lg:h-full"
      bodyClassName="overflow-y-auto"
    >
      <Section title={t("clock")}>
        <div className="flex items-baseline justify-between">
          <IstClock className="text-2xl font-medium leading-none text-ink" />
          <IstDate className="text-xs text-muted" />
        </div>
      </Section>

      <Section title={t("threatIndex")} code="02">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="label">{t("dashThreatHead")}</p>
            <span className="font-display text-5xl leading-none tabular-nums" style={{ color: threatColor }}>
              {String(sitrep.threat).padStart(2, "0")}
              <span className="num text-sm text-muted"> /100</span>
            </span>
          </div>
          <span className="stamp mb-1 !text-sm" style={{ ["--stamp" as string]: threatColor }}>
            {sitrep.threatLabel}
          </span>
        </div>
        <div
          role="meter"
          aria-label={t("threatIndex")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={sitrep.threat}
          aria-valuetext={`${sitrep.threat} — ${sitrep.threatLabel}`}
          className="mt-2 flex gap-px border border-border-strong bg-border-strong p-px"
        >
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <span key={i} aria-hidden className="h-3 flex-1" style={{ background: i < lit ? threatColor : "var(--surface-2)" }} />
          ))}
        </div>
        <dl className="mt-3 grid grid-cols-3 border border-border-strong bg-surface-2 text-center">
          {(
            [
              [t("events"), sitrep.total, false],
              ["Sev ≥4", sitrep.highSeverity, true],
              [t("hotspots"), sitrep.hotspots.length, false],
            ] as const
          ).map(([label, value, danger]) => (
            <div key={label} className="border-r border-border-strong py-1.5 last:border-r-0">
              <dt className="label !text-[9.5px]">{label}</dt>
              <dd className={`font-display text-2xl leading-tight tabular-nums ${danger && value > 0 ? "text-danger" : "text-ink"}`}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <VitalsSection vitals={vitals} />

      <Section title={t("categoryMatrix")} code="04">
        <table className="ledger-table text-xs">
          <thead>
            <tr>
              <th className="!w-3 !px-1" aria-label="colour" />
              <th>{t("dashCategory")}</th>
              <th aria-hidden />
              <th className="num">{t("dashCount")}</th>
            </tr>
          </thead>
          <tbody>
            {sitrep.byCategory.map(({ category, count }) => {
              const meta = CATEGORY_META[category];
              const label = lang === "hi" ? meta.hi : meta.label;
              return (
                <tr key={category}>
                  <td className="!px-1 !py-1 !align-middle">
                    <span aria-hidden className="block h-2.5 w-2.5 rounded-sm border border-ink/25" style={{ background: meta.color }} />
                  </td>
                  <td className="!py-1">
                    <button
                      type="button"
                      onClick={() => onIsolateCategory(category)}
                      aria-label={`Show only ${meta.label} (${count})`}
                      disabled={count === 0}
                      className={`max-w-[7.5rem] truncate text-left text-ink hover:text-accent hover:underline disabled:text-muted disabled:no-underline ${FOCUS_RING}`}
                    >
                      {label}
                    </button>
                  </td>
                  <td className="w-full !py-1 !align-middle" aria-hidden>
                    <span className="block h-2 border border-rule bg-surface-2">
                      <span className="block h-full" style={{ width: `${(count / maxCat) * 100}%`, background: meta.color }} />
                    </span>
                  </td>
                  <td className={`num !py-1 ${count === 0 ? "text-muted" : "font-semibold text-ink"}`}>{count}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>{lang === "hi" ? "कुल / Total" : "Total / कुल"}</td>
              <td className="num">{sitrep.total}</td>
            </tr>
          </tfoot>
        </table>
      </Section>

      <Section title={t("dataFeeds")} code="05">
        <table className="ledger-table text-xs">
          <thead>
            <tr>
              <th>ID</th>
              <th>{t("dashSource")}</th>
              <th>{t("dashStatus")}</th>
              <th className="num">{t("dashLatest")}</th>
            </tr>
          </thead>
          <tbody>
            {sitrep.bySource.map(({ source, count, latest }, i) => {
              const online = count > 0;
              return (
                <tr key={source}>
                  <td className="!py-1">
                    <span className="record-id">#{String(i + 1).padStart(4, "0")}</span>
                  </td>
                  <td className="num !py-1">{SOURCE_LABEL[source]}</td>
                  <td className="!py-1">
                    <span className={`stamp stamp-flat !text-[9.5px] ${online ? "stamp-ok" : "stamp-warn"}`}>
                      {online ? t("online") : t("noData")}
                    </span>
                  </td>
                  <td className="num !py-1 text-muted" suppressHydrationWarning>
                    {online && latest ? relativeTime(latest, now) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
          Data:{" "}
          {CREDITS.map((c, i) => (
            <span key={c.href}>
              {i > 0 && " · "}
              <a href={c.href} target="_blank" rel="noopener noreferrer" className="underline decoration-border-strong hover:text-accent">
                {c.label}
              </a>
            </span>
          ))}
          . Translations are machine-generated (Bhashini / Sarvam).
        </p>
      </Section>

      <Section title={t("hotspots")} code="06">
        {sitrep.hotspots.length === 0 ? (
          <p className="text-xs text-muted">{t("noHotspots")}</p>
        ) : (
          <table className="ledger-table text-xs">
            <tbody>
              {sitrep.hotspots.map((h, i) => (
                <tr key={h.state}>
                  <td className="!py-1">
                    <span className="record-id">#{String(i + 1).padStart(4, "0")}</span>
                  </td>
                  <td className="num !py-1 text-accent">{stateShort(h.state)}</td>
                  <td className="!py-1">{stateLabel(h.state, lang)}</td>
                  <td className={`num !py-1 ${h.maxSeverity >= 4 ? "font-semibold text-danger" : "text-muted"}`}>
                    {h.count} · S{h.maxSeverity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={t("priority")} code="07">
        {sitrep.priority.length === 0 ? (
          <p className="text-xs text-muted">{t("noPriority")}</p>
        ) : (
          <ul className="-mx-3">
            {sitrep.priority.map((e) => {
              const meta = CATEGORY_META[e.category];
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(e.id)}
                    className={`ledger-row group w-full !items-start text-left ${FOCUS_RING} focus-visible:ring-inset`}
                  >
                    <span className="record-id mt-0.5">#{String(e.id).padStart(4, "0")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2 text-[10.5px]">
                        <span className="inline-flex items-center gap-1 text-ink-soft">
                          <span aria-hidden className="h-2 w-2 rounded-sm border border-ink/25" style={{ background: meta.color }} />
                          {lang === "hi" ? meta.hi : meta.label}
                        </span>
                        <span className="num text-muted" suppressHydrationWarning>
                          {relativeTime(e.occurred_at, now)}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-ink group-hover:text-accent">
                        {displayTitle(e, lang)}
                      </span>
                    </span>
                    <span className={`stamp mt-0.5 ${e.severity >= 4 ? "stamp-danger" : "stamp-warn"}`}>S{e.severity}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </HudPanel>
  );
}
