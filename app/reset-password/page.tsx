import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getCurrentUser, hasSupabaseEnv } from "@/components/auth/session";
import { safeNext } from "../auth/safe-next";

export const metadata: Metadata = { title: "Choose a new password — Pulse" };

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
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-sm px-4 py-10">
        <header className="mb-6">
          <h1 className="glow text-lg font-bold uppercase tracking-[0.25em] text-accent">New password</h1>
          <p className="text-sm text-muted">
            {user?.email ? (
              <>
                Choose a new password for <span className="text-foreground">{user.email}</span>.
              </>
            ) : (
              "Choose a new password for your account."
            )}
          </p>
        </header>
        <section className="hud-panel p-5">
          {supabaseReady ? (
            <ResetPasswordForm next={next} />
          ) : (
            <p role="alert" className="text-sm text-muted">
              Password reset is unavailable: Supabase is not configured.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
