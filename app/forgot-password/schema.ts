import { z } from "zod";
import { magicLinkSchema } from "@/app/login/schema";

/** Same email rule as sign-in (trimmed, lower-cased, valid address). */
export const forgotPasswordSchema = z.object({ email: magicLinkSchema.shape.email });

export interface ForgotPasswordState {
  fieldErrors?: { email?: string };
  error?: string;
  message?: string;
  /** Echoed so the email field survives React's post-action form reset. */
  email?: string;
}

/**
 * Shown whether or not an account exists for the address, so the form can't be used to
 * discover which emails are registered.
 */
export const RESET_SENT_MESSAGE = "If an account exists for that email, we've sent a reset link.";

export const RATE_LIMITED_MESSAGE = "Too many reset requests. Please wait a few minutes and try again.";

/** The only Supabase error we surface: rate limiting (it says nothing about whether the account exists). */
export function isRateLimited(error: { status?: number; code?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit";
}

/** `/reset-password`, carrying where to go after the reset (when it isn't the home page). */
export function resetPasswordPath(next: string): string {
  return next === "/" ? "/reset-password" : `/reset-password?next=${encodeURIComponent(next)}`;
}
