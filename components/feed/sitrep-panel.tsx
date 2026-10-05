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
  LOW: "var(--accent)",
  GUARDED: "var(--accent)",
  ELEVATED: "var(--warn)",
  HIGH: "#ff7a1f",
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border px-3 py-3 last:border-b-0">
      <h3 className="hud-label mb-2 flex items-center gap-2">
        <span aria-hidden className="text-accent">▸</span>
        {title}
        <span aria-hidden className="h-px flex-1 bg-border" />
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
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label={label} className="mt-1 h-7 w-full">
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function VitalsSection({ vitals }: { vitals: Vitals }) {
  const { t, lang } = useLang();
  const { power, worstAir, mandi } = vitals;
  const hasAny = power.demand != null || worstAir.length > 0 || mandi.length > 0;
  return (
    <Section title={t("vitals")}>
      {!hasAny && <p className="text-[11px] text-muted">—</p>}
      {power.demand != null && (
        <div className="mb-3">
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="text-muted">{t("powerDemand")}</span>
            <span className="text-lg font-semibold tabular-nums text-accent">
              {power.demand} <span className="text-[10px] text-muted">GW</span>
            </span>
          </div>
          <Sparkline values={power.history} label={`${t("powerDemand")}, 24h`} />
          <p className="flex justify-between text-[10px] text-muted">
            {power.demandYesterday != null && <span>peak yday {power.demandYesterday} GW</span>}
            {power.price != null && (
              <span>
                {t("powerPrice")} ₹{power.price.toFixed(2)}/kWh
              </span>
            )}
          </p>
        </div>
      )}
      {worstAir.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-[11px] text-muted">{t("worstAir")}</p>
          <ul className="space-y-0.5 text-[11px]">
            {worstAir.map((a) => {
              const band = aqiBand(a.aqi);
              return (
                <li key={a.city} className="flex items-center gap-2">
                  <span aria-hidden className="h-2 w-2" style={{ background: band.color }} />
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {a.city}
                    {a.state && <span className="text-muted"> · {stateShort(a.state)}</span>}
                  </span>
                  <span className="tabular-nums" style={{ color: band.color }} title={a.modelled ? "Modelled (CAMS)" : "CPCB station"}>
                    {a.aqi}
                    {a.modelled ? "*" : ""}
                  </span>
                  <span className="w-16 text-right text-[10px] text-muted">{lang === "hi" ? band.hi : band.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {mandi.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] text-muted">{t("mandi")}</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            {mandi.map((m) => (
              <div key={m.commodity} className="flex justify-between">
                <dt className="text-muted">{m.commodity}</dt>
                <dd className="tabular-nums text-foreground">₹{m.price.toLocaleString("en-IN")}</dd>
              </div>
            ))}
          </dl>
        </div>
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
      right={<span className="hud-label">WIN {windowLabel}</span>}
      className="lg:h-full"
      bodyClassName="overflow-y-auto"
    >
      <Section title={t("clock")}>
        <div className="glow text-2xl font-semibold leading-none text-accent">
          <IstClock />
        </div>
        <p className="mt-1.5 text-right text-[11px] text-muted">
          <IstDate />
        </p>
      </Section>

      <Section title={t("threatIndex")}>
        <div className="flex items-end justify-between">
          <span className="text-4xl font-bold leading-none tabular-nums" style={{ color: threatColor, textShadow: `0 0 14px ${threatColor}` }}>
            {String(sitrep.threat).padStart(2, "0")}
          </span>
          <span
            className={`border px-2 py-0.5 text-xs font-bold tracking-[0.2em] ${sitrep.threatLabel === "SEVERE" ? "blink" : ""}`}
            style={{ color: threatColor, borderColor: threatColor }}
          >
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
          className="mt-2 flex gap-0.5"
        >
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className="h-2.5 flex-1"
              style={{
                background: i < lit ? threatColor : "var(--border)",
                boxShadow: i < lit ? `0 0 6px ${threatColor}` : undefined,
                opacity: i < lit ? 0.55 + (0.45 * (i + 1)) / SEGMENTS : 1,
              }}
            />
          ))}
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-1 text-center">
          {(
            [
              [t("events"), sitrep.total, false],
              ["Sev ≥4", sitrep.highSeverity, true],
              [t("hotspots"), sitrep.hotspots.length, false],
            ] as const
          ).map(([label, value, danger]) => (
            <div key={label} className="border border-border bg-background/60 py-1.5">
              <dt className="hud-label !text-[9px]">{label}</dt>
              <dd className={`text-base font-semibold tabular-nums ${danger && value > 0 ? "text-danger" : "text-foreground"}`}>{value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <VitalsSection vitals={vitals} />

      <Section title={t("categoryMatrix")}>
        <ul className="space-y-0.5">
          {sitrep.byCategory.map(({ category, count }) => {
            const meta = CATEGORY_META[category];
            const label = lang === "hi" ? meta.hi : meta.label;
            return (
              <li key={category}>
                <button
                  type="button"
                  onClick={() => onIsolateCategory(category)}
                  aria-label={`Show only ${meta.label} (${count})`}
                  disabled={count === 0}
                  className={`group grid w-full grid-cols-[0.5rem_6.5rem_1fr_2rem] items-center gap-2 px-1 py-0.5 text-left text-[11px] hover:bg-accent/5 disabled:opacity-35 ${FOCUS_RING}`}
                >
                  <span aria-hidden className="h-2 w-2" style={{ background: meta.color, boxShadow: `0 0 6px ${meta.color}` }} />
                  <span className="truncate uppercase tracking-wider text-muted group-hover:text-foreground">{label}</span>
                  <span aria-hidden className="h-1.5 bg-border">
                    <span className="block h-full" style={{ width: `${(count / maxCat) * 100}%`, background: meta.color }} />
                  </span>
                  <span className="text-right tabular-nums text-foreground">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={t("dataFeeds")}>
        <ul className="space-y-1 text-[11px]">
          {sitrep.bySource.map(({ source, count, latest }) => {
            const online = count > 0;
            return (
              <li key={source} className="flex items-center gap-2">
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${online ? "bg-accent shadow-[0_0_6px_var(--accent)]" : "bg-warn blink"}`} />
                <span className="w-16 text-foreground">{SOURCE_LABEL[source]}</span>
                <span className={online ? "text-accent" : "text-warn"}>{online ? t("online") : t("noData")}</span>
                <span className="ml-auto text-right tabular-nums text-muted" suppressHydrationWarning>
                  {online && latest ? relativeTime(latest, now) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[9px] leading-relaxed text-muted">
          Data:{" "}
          {CREDITS.map((c, i) => (
            <span key={c.href}>
              {i > 0 && " · "}
              <a href={c.href} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                {c.label}
              </a>
            </span>
          ))}
          . Translations are machine-generated (Bhashini / Sarvam).
        </p>
      </Section>

      <Section title={t("hotspots")}>
        {sitrep.hotspots.length === 0 ? (
          <p className="text-[11px] text-muted">{t("noHotspots")}</p>
        ) : (
          <ol className="space-y-1 text-[11px]">
            {sitrep.hotspots.map((h, i) => (
              <li key={h.state} className="flex items-center gap-2">
                <span className="w-4 tabular-nums text-muted">{i + 1}</span>
                <span className="w-6 text-accent">{stateShort(h.state)}</span>
                <span className="min-w-0 flex-1 truncate text-foreground">{stateLabel(h.state, lang)}</span>
                <span className={`tabular-nums ${h.maxSeverity >= 4 ? "text-danger" : "text-muted"}`}>
                  {h.count} · S{h.maxSeverity}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title={t("priority")}>
        {sitrep.priority.length === 0 ? (
          <p className="text-[11px] text-muted">{t("noPriority")}</p>
        ) : (
          <ul className="space-y-1.5">
            {sitrep.priority.map((e) => {
              const meta = CATEGORY_META[e.category];
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(e.id)}
                    className={`group w-full border-l-2 bg-background/40 px-2 py-1 text-left hover:bg-accent/5 ${FOCUS_RING}`}
                    style={{ borderColor: meta.color }}
                  >
                    <span className="flex items-center justify-between text-[10px] tracking-wider">
                      <span style={{ color: meta.color }}>
                        {(lang === "hi" ? meta.hi : meta.label.toUpperCase())} · S{e.severity}
                      </span>
                      <span className="text-muted" suppressHydrationWarning>
                        {relativeTime(e.occurred_at, now)}
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 font-sans text-xs leading-snug text-foreground group-hover:text-accent">
                      {displayTitle(e, lang)}
                    </span>
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
