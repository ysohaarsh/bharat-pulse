import { z } from "zod";
import { REPORT_KINDS, REPORT_PHOTO_MAX_BYTES, REPORT_PHOTO_TYPES } from "./kinds";

/** Client-side validation for a civic report; the database enforces the same limits. */
export const reportSchema = z.object({
  kind: z.enum(REPORT_KINDS, { error: "Pick what's wrong" }),
  description: z
    .string()
    .trim()
    .min(3, { error: "Add a few words (at least 3 characters)" })
    .max(1000, { error: "Keep it under 1000 characters" }),
  lat: z.number({ error: "Place the pin on the map" }).min(6).max(37.5),
  lng: z.number({ error: "Place the pin on the map" }).min(68).max(97.5),
});

export type ReportInput = z.output<typeof reportSchema>;

/** Photo checks mirrored from the storage bucket config (type + 5 MB). Null when OK. */
export function photoProblem(file: { type: string; size: number } | null): string | null {
  if (!file) return null;
  if (!(REPORT_PHOTO_TYPES as readonly string[]).includes(file.type)) return "Photo must be JPEG, PNG or WebP";
  if (file.size > REPORT_PHOTO_MAX_BYTES) return "Photo must be 5 MB or smaller";
  return null;
}

/** "<user id>/<random>.jpg" — the storage policy only allows uploads into your own folder. */
export function photoPath(userId: string, type: string, random: string): string {
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return `${userId}/${random}.${ext}`;
}

/** Parse ?lat=&lng= from the URL (e.g. "Report an issue here" in the Who's-my-neta panel). */
export function pointFromParams(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const a = Number(Array.isArray(lat) ? lat[0] : lat);
  const b = Number(Array.isArray(lng) ? lng[0] : lng);
  return Number.isFinite(a) && Number.isFinite(b) && a >= 6 && a <= 37.5 && b >= 68 && b <= 97.5 ? { lat: a, lng: b } : null;
}
