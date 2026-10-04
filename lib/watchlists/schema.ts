import { z } from "zod";
import { CATEGORIES, type Category } from "@/lib/types";

export const MAX_COUNTRIES = 50;
export const MAX_KEYWORDS = 20;

const regionNames = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });

/** Common non-ISO aliases people type. */
const COUNTRY_ALIASES: Record<string, string> = { UK: "GB" };

/** True when `code` is an ISO 3166-1 alpha-2 region the runtime knows about. */
export function isCountryCode(code: string): boolean {
  if (!/^[A-Z]{2}$/.test(code)) return false;
  const name = regionNames.of(code);
  return name !== undefined && name !== "Unknown Region" && name !== code;
}

/** Friendly name for an ISO-2 code ("JP" → "Japan"); falls back to the code. */
export function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Splits a comma/newline separated list, trims, drops empties and case-insensitive duplicates. */
export function splitList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const v = part.trim().replace(/\s+/g, " ");
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

const countriesField = z
  .string()
  .max(1000)
  .transform((raw) =>
    splitList(raw).map((c) => {
      const up = c.toUpperCase();
      return COUNTRY_ALIASES[up] ?? up;
    }),
  )
  .pipe(
    z
      .array(z.string().refine(isCountryCode, { error: (iss) => `"${iss.input}" isn't an ISO country code (e.g. US, GB, JP)` }))
      .max(MAX_COUNTRIES, { error: `At most ${MAX_COUNTRIES} countries` }),
  )
  .transform((codes) => [...new Set(codes)]);

const keywordsField = z
  .string()
  .max(2000)
  .transform(splitList)
  .pipe(
    z
      .array(z.string().min(2, { error: "Keywords need at least 2 characters" }).max(60, { error: "Keywords are limited to 60 characters" }))
      .max(MAX_KEYWORDS, { error: `At most ${MAX_KEYWORDS} keywords` }),
  );

const categoriesField = z
  .array(z.enum(CATEGORIES, { error: "Unknown category" }))
  .transform((cats) => CATEGORIES.filter((c) => cats.includes(c)));

export const watchlistSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Give the watchlist a name" })
    .max(80, { error: "Name is limited to 80 characters" }),
  countries: countriesField,
  categories: categoriesField,
  keywords: keywordsField,
  min_severity: z.coerce
    .number({ error: "Pick a severity" })
    .int()
    .min(1, { error: "Severity is 1–5" })
    .max(5, { error: "Severity is 1–5" }),
});

export type WatchlistInput = z.output<typeof watchlistSchema>;
export type WatchlistField = keyof WatchlistInput;
export type WatchlistFieldErrors = Partial<Record<WatchlistField, string[]>>;

/** Raw string form values, echoed back to the form after a failed submit. */
export interface WatchlistFormValues {
  name: string;
  countries: string;
  categories: Category[];
  keywords: string;
  min_severity: string;
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v : "";
}

export function readWatchlistForm(formData: FormData): WatchlistFormValues {
  return {
    name: str(formData.get("name")),
    countries: str(formData.get("countries")),
    categories: formData
      .getAll("categories")
      .filter((v): v is string => typeof v === "string")
      .filter((v): v is Category => (CATEGORIES as readonly string[]).includes(v)),
    keywords: str(formData.get("keywords")),
    min_severity: str(formData.get("min_severity")) || "1",
  };
}

/** Validate a submitted watchlist form. Unknown category values are reported, not silently dropped. */
export function parseWatchlistForm(formData: FormData) {
  return watchlistSchema.safeParse({
    name: str(formData.get("name")),
    countries: str(formData.get("countries")),
    categories: formData.getAll("categories"),
    keywords: str(formData.get("keywords")),
    min_severity: str(formData.get("min_severity")) || "1",
  });
}

/** Convert a stored row back into form values for editing. */
export function toFormValues(w: {
  name: string;
  countries: string[];
  categories: string[];
  keywords: string[];
  min_severity: number;
}): WatchlistFormValues {
  return {
    name: w.name,
    countries: w.countries.join(", "),
    categories: w.categories.filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c)),
    keywords: w.keywords.join(", "),
    min_severity: String(w.min_severity),
  };
}
