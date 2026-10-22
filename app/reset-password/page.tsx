import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, FormSlip } from "@/components/auth/form-slip";
import { Notice } from "@/components/auth/notice";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getCurrentUser, hasSupabaseEnv } from "@/components/auth/session";
import { safeNext } from "../auth/safe-next";

export const metadata: Metadata = { title: "Choose a new password — Bharat Pulse" };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Reached from the reset email via /auth/confirm, which has already turned the link into a
 * session. Without one (expired/used link, or opened directly) the user is sent to request a new link.
 */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const next = safeNext(first((await searchParams).next));

  const supabaseReady = hasSupabaseEnv();
  const user = supabaseReady ? await getCurrentUser() : null;
  if (supabaseReady && !user) {
    const url = new URLSearchParams({ error: "session_missing" });
    if (next !== "/") url.set("next", next);
    redirect(`/forgot-password?${url.toString()}`);
  }

  return (
    <AuthShell
      title="New password"
      intro={
        user?.email ? (
          <>
            Choose a new password for <span className="font-semibold text-ink">{user.email}</span>.
          </>
        ) : (
          "Choose a new password for your account."
        )
      }
    >
      <FormSlip formNo="BP-03" title="New password / नया पासवर्ड">
        {supabaseReady ? (
          <ResetPasswordForm next={next} />
        ) : (
          <Notice kind="warn">Password reset is unavailable: Supabase is not configured.</Notice>
        )}
      </FormSlip>
    </AuthShell>
  );
}
