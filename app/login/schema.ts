import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email({ error: "Enter a valid email address" }));

export const signInSchema = z.object({
  email,
  password: z.string().min(1, { error: "Enter your password" }).max(72),
});

export const signUpSchema = z.object({
  email,
  password: z
    .string()
    .min(8, { error: "Use at least 8 characters" })
    .max(72, { error: "Use at most 72 characters" }),
});

export const magicLinkSchema = z.object({ email });

export type AuthField = "email" | "password";

export interface AuthFormState {
  fieldErrors?: Partial<Record<AuthField, string>>;
  error?: string;
  message?: string;
  /** Echoed so the email field survives React's post-action form reset. */
  email?: string;
}

/** First error message per field from a zod error. */
export function firstErrors(error: z.ZodError): Partial<Record<AuthField, string>> {
  const out: Partial<Record<AuthField, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if ((key === "email" || key === "password") && !out[key]) out[key] = issue.message;
  }
  return out;
}
