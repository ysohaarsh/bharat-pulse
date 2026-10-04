"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/components/auth/session";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "../auth/safe-next";
import {
  resetFieldErrors,
  resetPasswordSchema,
  SESSION_EXPIRED_MESSAGE,
  updatePasswordErrorMessage,
  type ResetPasswordState,
} from "./schema";

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

/** Sets a new password for the signed-in (recovery) session, then shows the success page. */
export async function updatePassword(_prev: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const next = safeNext(field(formData, "next"));
  const parsed = resetPasswordSchema.safeParse({
    password: field(formData, "password"),
    confirm: field(formData, "confirm"),
  });
  if (!parsed.success) return { fieldErrors: resetFieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return { error: "Password reset is unavailable: Supabase is not configured." };

  try {
    const supabase = await createClient();
    // Re-verify the session with the Auth server; the page check may be stale by now.
    const { data: current, error: userError } = await supabase.auth.getUser();
    if (userError || !current.user) return { error: SESSION_EXPIRED_MESSAGE };

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
      console.warn("[reset-password]", error.status, error.code ?? error.name);
      return { error: updatePasswordErrorMessage(error) };
    }

    // Supabase already revokes other refresh tokens on a password change; this makes it explicit.
    const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
    if (signOutError) console.warn("[reset-password] sign out others:", signOutError.code ?? signOutError.name);
  } catch (err) {
    console.warn("[reset-password]", err instanceof Error ? err.message : String(err));
    return { error: "We couldn't update your password. Please try again." };
  }

  revalidatePath("/", "layout");
  redirect(next === "/" ? "/reset-password/done" : `/reset-password/done?next=${encodeURIComponent(next)}`);
}
