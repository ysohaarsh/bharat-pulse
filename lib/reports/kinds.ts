/** Civic report types. Keep in sync with the CHECK on public.reports.kind. */
export const REPORT_KINDS = [
  "pothole",
  "garbage",
  "streetlight",
  "waterlogging",
  "water_supply",
  "construction_hazard",
  "encroachment",
  "other",
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_KIND_LABEL: Record<ReportKind, { en: string; hi: string; icon: string }> = {
  pothole: { en: "Pothole / bad road", hi: "गड्ढा / ख़राब सड़क", icon: "◍" },
  garbage: { en: "Garbage not cleared", hi: "कचरा नहीं उठा", icon: "♻" },
  streetlight: { en: "Streetlight out", hi: "स्ट्रीटलाइट बंद", icon: "☀" },
  waterlogging: { en: "Waterlogging / drainage", hi: "जलभराव / नाली", icon: "≋" },
  water_supply: { en: "No water supply", hi: "पानी की आपूर्ति नहीं", icon: "⌁" },
  construction_hazard: { en: "Unsafe construction / debris", hi: "असुरक्षित निर्माण / मलबा", icon: "⚠" },
  encroachment: { en: "Encroachment / blocked footpath", hi: "अतिक्रमण / फुटपाथ बंद", icon: "⛔" },
  other: { en: "Other", hi: "अन्य", icon: "•" },
};

export function isReportKind(v: unknown): v is ReportKind {
  return typeof v === "string" && (REPORT_KINDS as readonly string[]).includes(v);
}

export const REPORT_PHOTO_BUCKET = "report-photos";
export const REPORT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const REPORT_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Public URL of a photo in the report-photos bucket. */
export function reportPhotoUrl(supabaseUrl: string, path: string | null): string | null {
  return path ? `${supabaseUrl}/storage/v1/object/public/${REPORT_PHOTO_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}` : null;
}
