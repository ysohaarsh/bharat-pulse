"use client";

import { CATEGORY_META } from "@/lib/categories";
import type { Sitrep } from "@/lib/events/sitrep";
import { countryName } from "@/lib/stats/format";
import type { Category } from "@/lib/types";
import { HudPanel } from "@/components/hud/hud-panel";
import { LocalClock, UtcClock, UtcDate } from "@/components/hud/utc-clock";
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

/** Attribution required by the upstream data providers. */
const CREDITS = [
  { label: "USGS", href: "https://earthquake.usgs.gov" },
  { label: "NASA EONET", href: "https://eonet.gsfc.nasa.gov" },
  { label: "The GDELT Project", href: "https://www.gdeltproject.org" },
  { label: "GDACS", href: "https://www.gdacs.org" },
  { label: "WHO Disease Outbreak News", href: "https://www.who.int/emergencies/disease-outbreak-news" },
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

export function SitrepPanel({
  sitrep,
  now,
  windowLabel,
  onSelect,
  onIsolateCategory,
}: {
  sitrep: Sitrep;
  now: number;
  windowLabel: string;
  onSelect: (id: number) => void;
  onIsolateCategory: (c: Category) => void;
}) {
  const threatColor = THREAT_COLOR[sitrep.threatLabel];
  const lit = Math.round((sitrep.threat / 100) * SEGMENTS);
  const maxCat = Math.max(1, ...sitrep.byCategory.map((c) => c.count));

  return (
    <HudPanel
      as="aside"
      aria-label="Situation report"
      title="Sitrep"
      code="01"
      right={<span className="hud-label">WIN {windowLabel}</span>}
      className="lg:h-full"
      bodyClassName="overflow-y-auto"
    >
      <Section title="Clock">
        <div className="glow text-2xl font-semibold leading-none text-accent">
          <UtcClock />
        </div>
        <p className="mt-1.5 flex justify-between text-[11px] text-muted">
          <span>
            LOCAL <LocalClock className="text-foreground" />
          </span>
          <UtcDate />
        </p>
      </Section>

      <Section title="Threat index">
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
          aria-label="Threat index"
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
          {[
            ["Events", sitrep.total],
            ["Sev ≥4", sitrep.highSeverity],
            ["Hotspots", sitrep.hotspots.length],
          ].map(([label, value]) => (
            <div key={label} className="border border-border bg-background/60 py-1.5">
              <dt className="hud-label !text-[9px]">{label}</dt>
              <dd className={`text-base font-semibold tabular-nums ${label === "Sev ≥4" && Number(value) > 0 ? "text-danger" : "text-foreground"}`}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Category matrix">
        <ul className="space-y-0.5">
          {sitrep.byCategory.map(({ category, count }) => {
            const meta = CATEGORY_META[category];
            return (
              <li key={category}>
                <button
                  type="button"
                  onClick={() => onIsolateCategory(category)}
                  aria-label={`Show only ${meta.label} (${count})`}
                  disabled={count === 0}
                  className={`group grid w-full grid-cols-[0.5rem_5.5rem_1fr_2rem] items-center gap-2 px-1 py-0.5 text-left text-[11px] hover:bg-accent/5 disabled:opacity-35 ${FOCUS_RING}`}
                >
                  <span aria-hidden className="h-2 w-2" style={{ background: meta.color, boxShadow: `0 0 6px ${meta.color}` }} />
                  <span className="truncate uppercase tracking-wider text-muted group-hover:text-foreground">{meta.label}</span>
                  <span aria-hidden className="h-1.5 bg-border">
                    <span className="block h-full" style={{ width: `${(count / maxCat) * 100}%`, background: meta.color }} />
                  </span>
                  <span className="text-right tabular-nums text-foreground">{count}</span>
                </button>
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
          . WHO content CC BY-NC-SA 3.0 IGO; GDACS alerts are automated estimates.
        </p>
      </Section>

      <Section title="Data feeds">
        <ul className="space-y-1 text-[11px]">
          {sitrep.bySource.map(({ source, count, latest }) => {
            const online = count > 0;
            return (
              <li key={source} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${online ? "bg-accent shadow-[0_0_6px_var(--accent)]" : "bg-warn blink"}`}
                />
                <span className="w-24 text-foreground">{SOURCE_LABEL[source]}</span>
                <span className={online ? "text-accent" : "text-warn"}>{online ? "ONLINE" : "NO DATA"}</span>
                <span className="ml-auto text-right tabular-nums text-muted" suppressHydrationWarning>
                  {online && latest ? relativeTime(latest, now) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Hotspots">
        {sitrep.hotspots.length === 0 ? (
          <p className="text-[11px] text-muted">No located events in this window.</p>
        ) : (
          <ol className="space-y-1 text-[11px]">
            {sitrep.hotspots.map((h, i) => (
              <li key={h.country} className="flex items-center gap-2">
                <span className="w-4 text-muted tabular-nums">{i + 1}</span>
                <span className="w-6 text-accent">{h.country}</span>
                <span className="min-w-0 flex-1 truncate text-foreground">{countryName(h.country)}</span>
                <span className={`tabular-nums ${h.maxSeverity >= 4 ? "text-danger" : "text-muted"}`}>
                  {h.count} · S{h.maxSeverity}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Priority traffic">
        {sitrep.priority.length === 0 ? (
          <p className="text-[11px] text-muted">Nothing at severity 3+.</p>
        ) : (
          <ul className="space-y-1.5">
            {sitrep.priority.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelect(e.id)}
                  className={`group w-full border-l-2 bg-background/40 px-2 py-1 text-left hover:bg-accent/5 ${FOCUS_RING}`}
                  style={{ borderColor: CATEGORY_META[e.category].color }}
                >
                  <span className="flex items-center justify-between text-[10px] tracking-wider">
                    <span style={{ color: CATEGORY_META[e.category].color }}>
                      {CATEGORY_META[e.category].label.toUpperCase()} · S{e.severity}
                    </span>
                    <span className="text-muted" suppressHydrationWarning>
                      {relativeTime(e.occurred_at, now)}
                    </span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 font-sans text-xs leading-snug text-foreground group-hover:text-accent">
                    {e.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </HudPanel>
  );
}
