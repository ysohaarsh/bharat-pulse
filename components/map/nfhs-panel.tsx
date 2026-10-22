"use client";

import { useLang } from "@/components/i18n/lang-provider";
import { NFHS_BY_KEY, NFHS_INDICATORS, nfhsRamp, type NfhsKey } from "@/lib/india/nfhs";
import type { NfhsStatus } from "./use-nfhs";

/** Layers-box section for the NFHS-5 overlay: indicator dropdown, 5-class legend, source credit. */
export function NfhsPanel({ indicator, onIndicator, status }: { indicator: NfhsKey; onIndicator: (k: NfhsKey) => void; status: NfhsStatus }) {
  const { t } = useLang();
  const ind = NFHS_BY_KEY[indicator];
  const ramp = nfhsRamp(ind);
  const [b0, b1, b2, b3] = ind.bins;
  const u = ind.unit;
  const labels = [`<${b0}${u}`, `${b0}-${b1}`, `${b1}-${b2}`, `${b2}-${b3}`, `≥${b3}${u}`];
  return (
    <div className="mt-1 w-[13.5rem] max-w-full border-t border-rule pt-1.5 text-[10.5px] leading-snug">
      <select
        aria-label={t("nfhsIndicator")}
        value={indicator}
        onChange={(e) => onIndicator(e.target.value as NfhsKey)}
        className="min-h-8 w-full rounded-sm border border-border-strong bg-surface px-1 text-[11.5px] text-ink focus-visible:outline-2 focus-visible:outline-accent"
      >
        {NFHS_INDICATORS.map((i) => (
          <option key={i.key} value={i.key}>
            {t(i.label)}
          </option>
        ))}
      </select>
      {status === "loading" && (
        <p role="status" className="mt-1 text-muted">
          {t("nfhsLoading")}
        </p>
      )}
      {status === "error" && (
        <p role="status" className="mt-1 text-warn">
          {t("nfhsError")}
        </p>
      )}
      <ul className="mt-1.5 grid grid-cols-5 gap-px" aria-label={t(ind.label)}>
        {ramp.map((c, i) => (
          <li key={c} className="min-w-0">
            <span aria-hidden className="block h-2.5 border border-ink/25" style={{ backgroundColor: c }} />
            <span className="num block truncate text-center text-[9.5px] text-ink-soft">{labels[i]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 flex items-center gap-1.5 text-muted">
        <span
          aria-hidden
          className="inline-block h-2.5 w-4 border border-ink/25"
          style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent 0 2px, rgb(86 91 120 / 0.6) 2px 3px)" }}
        />
        {t("nfhsNoData")} · {t(ind.badHigh ? "nfhsWorse" : "nfhsBetter")}
      </p>
      <p className="mt-1 text-muted">{t("nfhsSource")}</p>
    </div>
  );
}
