import { z } from "zod";

/** Same length rules as sign-up (bcrypt only uses the first 72 bytes). */
export const newPasswordSchema = z
  .string()
  .min(8, { error: "Use at least 8 characters" })
  .max(72, { error: "Use at most 72 characters" });

export const resetPasswordSchema = z
  .object({
    password: newPasswordSchema,
    confirm: z.string().min(1, { error: "Confirm your new password" }),
  })
  .refine((d) => d.password === d.confirm, { error: "Passwords don't match", path: ["confirm"] });

export type ResetField = "password" | "confirm";

export interface ResetPasswordState {
  fieldErrors?: Partial<Record<ResetField, string>>;
  error?: string;
}

/** First error message per field from a zod error. */
export function resetFieldErrors(error: z.ZodError): Partial<Record<ResetField, string>> {
  const out: Partial<Record<ResetField, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if ((key === "password" || key === "confirm") && !out[key]) out[key] = issue.message;
  }
  return out;
}

export const SESSION_EXPIRED_MESSAGE = "Your reset session has expired. Request a new reset link.";

/** Friendly text for a failed `updateUser({ password })`; Supabase's raw message is never shown. */
export function updatePasswordErrorMessage(error: { status?: number; code?: string }): string {
  switch (error.code) {
    case "same_password":
      return "Your new password must be different from your current one.";
    case "weak_password":
      return "That password is too weak or too common. Try a longer one with a mix of letters, numbers and symbols.";
    case "reauthentication_needed":
    case "session_not_found":
    case "session_expired":
    case "user_not_found":
      return SESSION_EXPIRED_MESSAGE;
    case "over_request_rate_limit":
      return "Too many attempts. Please wait a few minutes and try again.";
  }
  if (error.status === 429) return "Too many attempts. Please wait a few minutes and try again.";
  if (error.status === 401 || error.status === 403) return SESSION_EXPIRED_MESSAGE;
  return "We couldn't update your password. Please try again.";
}
