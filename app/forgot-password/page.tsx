import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { hasSupabaseEnv } from "@/components/auth/session";
import { FOCUS } from "@/components/auth/styles";
import { resetErrorMessage } from "@/app/auth/errors";
import { safeNext } from "../auth/safe-next";

export const metadata: Metadata = { title: "Reset password — Pulse" };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const params = await searchParams;
  const next = safeNext(first(params.next));
  const error = resetErrorMessage(first(params.error));
  const loginHref = next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-sm px-4 py-10">
        <header className="mb-6">
          <h1 className="glow text-lg font-bold uppercase tracking-[0.25em] text-accent">Reset password</h1>
          <p className="text-sm text-muted">
            Enter your account email and we&apos;ll send you a link to choose a new password. Open it in this
            browser.
          </p>
        </header>
        <section className="hud-panel p-5">
          {hasSupabaseEnv() ? (
            <ForgotPasswordForm next={next} initialError={error} />
          ) : (
            <p role="alert" className="text-sm text-muted">
              Password reset is unavailable: Supabase is not configured.
            </p>
          )}
          <p className="mt-5 border-t border-border pt-4 text-sm text-muted">
            Remembered it?{" "}
            <Link href={loginHref} className={`text-accent hover:underline ${FOCUS}`}>
              Back to sign in
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
