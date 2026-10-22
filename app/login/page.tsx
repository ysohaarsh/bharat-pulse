import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, FormSlip } from "@/components/auth/form-slip";
import { Notice } from "@/components/auth/notice";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser, hasSupabaseEnv } from "@/components/auth/session";
import { loginErrorMessage } from "@/app/auth/errors";
import { safeNext } from "../auth/safe-next";

export const metadata: Metadata = { title: "Sign in — Bharat Pulse" };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(first(params.next));
  const error = loginErrorMessage(first(params.error));

  if (await getCurrentUser()) redirect(next);

  return (
    <AuthShell title="Sign in" intro="Sign in to save watchlists and get alerts for events you care about.">
      <FormSlip formNo="BP-01" title="Sign in / साइन इन">
        {hasSupabaseEnv() ? (
          <LoginForm next={next} initialError={error} />
        ) : (
          <Notice kind="warn">Sign-in is unavailable: Supabase is not configured.</Notice>
        )}
      </FormSlip>
    </AuthShell>
  );
}
