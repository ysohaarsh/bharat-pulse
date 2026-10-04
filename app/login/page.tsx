import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser, hasSupabaseEnv } from "@/components/auth/session";
import { loginErrorMessage } from "@/app/auth/errors";
import { safeNext } from "../auth/safe-next";

export const metadata: Metadata = { title: "Sign in — Pulse" };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(first(params.next));
  const error = loginErrorMessage(first(params.error));

  if (await getCurrentUser()) redirect(next);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-sm px-4 py-10">
        <header className="mb-6">
          <h1 className="glow text-lg font-bold uppercase tracking-[0.25em] text-accent">Welcome to Pulse</h1>
          <p className="text-sm text-muted">Sign in to save watchlists and get alerts for events you care about.</p>
        </header>
        <section className="hud-panel p-5">
          {hasSupabaseEnv() ? (
            <LoginForm next={next} initialError={error} />
          ) : (
            <p role="alert" className="text-sm text-muted">
              Sign-in is unavailable: Supabase is not configured.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
