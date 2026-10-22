"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { createWatchlist, updateWatchlist, type WatchlistFormState } from "@/app/watchlists/actions";
import { Notice } from "@/components/auth/notice";
import { BTN_PRIMARY, BTN_SECONDARY, FIELD_ERROR, HINT, INPUT, LABEL } from "@/components/auth/styles";
import { CATEGORY_META } from "@/lib/categories";
import { CATEGORIES } from "@/lib/types";
import type { WatchlistField, WatchlistFormValues } from "@/lib/watchlists/schema";

const BLANK: WatchlistFormValues = { name: "", states: "", categories: [], keywords: "", min_severity: "1" };

const SEVERITY_OPTIONS = [
  { value: "1", label: "1 — Any" },
  { value: "2", label: "2+ — Minor and up" },
  { value: "3", label: "3+ — Moderate and up" },
  { value: "4", label: "4+ — Major and up" },
  { value: "5", label: "5 — Critical only" },
];

function Errors({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className={FIELD_ERROR}>
      {errors.join(" · ")}
    </p>
  );
}

export function WatchlistForm({ id, initial }: { id?: number; initial?: WatchlistFormValues }) {
  const editing = id !== undefined;
  const action = editing ? updateWatchlist.bind(null, id) : createWatchlist;
  const [state, formAction, pending] = useActionState<WatchlistFormState, FormData>(action, {});
  const values = state.values ?? initial ?? BLANK;
  const uid = useId();
  const fid = (f: WatchlistField) => `${uid}-${f}`;
  const errs = state.fieldErrors ?? {};
  const describe = (f: WatchlistField, hint?: boolean) =>
    [errs[f]?.length ? `${fid(f)}-error` : null, hint ? `${fid(f)}-hint` : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <form
      key={state.savedCount ?? 0}
      action={formAction}
      noValidate
      aria-label={editing ? `Edit watchlist ${initial?.name ?? ""}` : "New watchlist"}
      className="flex flex-col gap-4"
    >
      <div>
        <label htmlFor={fid("name")} className={LABEL}>
          नाम / Name
        </label>
        <input
          id={fid("name")}
          name="name"
          required
          maxLength={80}
          defaultValue={values.name}
          placeholder="e.g. Pacific earthquakes"
          aria-invalid={errs.name ? true : undefined}
          aria-describedby={describe("name")}
          className={INPUT}
        />
        <Errors id={`${fid("name")}-error`} errors={errs.name} />
      </div>

      <fieldset aria-describedby={describe("categories", true)}>
        <legend className={LABEL}>श्रेणी / Categories</legend>
        <p id={`${fid("categories")}-hint`} className="mb-2 text-xs text-muted">
          None selected = all categories.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <label key={c} className="cursor-pointer">
              <input
                type="checkbox"
                name="categories"
                value={c}
                defaultChecked={values.categories.includes(c)}
                className="peer sr-only"
              />
              <span className="chip peer-checked:!border-maroon-deep peer-checked:!bg-maroon peer-checked:!text-cream peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-accent">
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: CATEGORY_META[c].color }} />
                {CATEGORY_META[c].label}
              </span>
            </label>
          ))}
        </div>
        <Errors id={`${fid("categories")}-error`} errors={errs.categories} />
      </fieldset>

      <div className="grid gap-4">
        <div>
          <label htmlFor={fid("states")} className={LABEL}>
            राज्य / States
          </label>
          <input
            id={fid("states")}
            name="states"
            defaultValue={values.states}
            placeholder="Karnataka, KA, IN-MH"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={errs.states ? true : undefined}
            aria-describedby={describe("states", true)}
            className={`${INPUT} num`}
          />
          <p id={`${fid("states")}-hint`} className={HINT}>
            Comma-separated states or UTs (names or codes). Empty = all of India.
          </p>
          <Errors id={`${fid("states")}-error`} errors={errs.states} />
        </div>

        <div>
          <label htmlFor={fid("min_severity")} className={LABEL}>
            न्यूनतम गंभीरता / Min severity
          </label>
          <select
            id={fid("min_severity")}
            name="min_severity"
            defaultValue={values.min_severity}
            aria-invalid={errs.min_severity ? true : undefined}
            aria-describedby={describe("min_severity")}
            className={INPUT}
          >
            {SEVERITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Errors id={`${fid("min_severity")}-error`} errors={errs.min_severity} />
        </div>
      </div>

      <div>
        <label htmlFor={fid("keywords")} className={LABEL}>
          कीवर्ड / Keywords
        </label>
        <input
          id={fid("keywords")}
          name="keywords"
          defaultValue={values.keywords}
          placeholder="tsunami, evacuation"
          aria-invalid={errs.keywords ? true : undefined}
          aria-describedby={describe("keywords", true)}
          className={INPUT}
        />
        <p id={`${fid("keywords")}-hint`} className={HINT}>
          Comma-separated; matches title or summary, case-insensitive. Empty = any text.
        </p>
        <Errors id={`${fid("keywords")}-error`} errors={errs.keywords} />
      </div>

      <div aria-live="polite">
        {state.error && <Notice kind="error">{state.error}</Notice>}
      </div>

      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create watchlist"}
        </button>
        {editing && (
          <Link href="/watchlists" className={BTN_SECONDARY}>
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
