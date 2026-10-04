"use server";

import { headers } from "next/headers";
import { hasSupabaseEnv } from "@/components/auth/session";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "../auth/safe-next";
import {
  forgotPasswordSchema,
  isRateLimited,
  RATE_LIMITED_MESSAGE,
  RESET_SENT_MESSAGE,
  resetPasswordPath,
  type ForgotPasswordState,
} from "./schema";

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

/**
 * Absolute site origin for email links (same logic as app/login/actions.ts; not imported from there
 * because every export of a "use server" file becomes a callable Server Action).
 * Supabase still checks the final URL against the allowed redirect URLs.
 */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Emails a password-reset link that lands on /auth/confirm → /reset-password.
 * Always answers with the same neutral message (no account enumeration); only rate limiting is surfaced.
 */
export async function requestPasswordReset(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const next = safeNext(field(formData, "next"));
  const raw = { email: field(formData, "email") };
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: { email: parsed.error.issues[0]?.message }, email: raw.email };
  }
  if (!hasSupabaseEnv()) {
    return { error: "Password reset is unavailable: Supabase is not configured.", email: raw.email };
  }

  const redirectTo = new URL("/auth/confirm", await siteOrigin());
  redirectTo.searchParams.set("next", resetPasswordPath(next));

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: redirectTo.toString(),
    });
    if (error) {
      if (isRateLimited(error)) return { error: RATE_LIMITED_MESSAGE, email: raw.email };
      // Logged without the address; the user still sees the neutral message.
      console.warn("[forgot-password]", error.status, error.code ?? error.name);
    }
  } catch (err) {
    console.warn("[forgot-password]", err instanceof Error ? err.message : String(err));
  }
  return { message: RESET_SENT_MESSAGE, email: raw.email };
}
