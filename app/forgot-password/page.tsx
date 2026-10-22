import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { hasSupabaseEnv } from "@/components/auth/session";
import { AuthShell, FormSlip } from "@/components/auth/form-slip";
import { Notice } from "@/components/auth/notice";
import { FOCUS } from "@/components/auth/styles";
import { resetErrorMessage } from "@/app/auth/errors";
import { safeNext } from "../auth/safe-next";

export const metadata: Metadata = { title: "Reset password — Bharat Pulse" };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const params = await searchParams;
  const next = safeNext(first(params.next));
  const error = resetErrorMessage(first(params.error));
  const loginHref = next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;

  return (
    <AuthShell
      title="Reset password"
      intro="Enter your account email and we'll send you a link to choose a new password. Open it in this browser."
    >
      <FormSlip formNo="BP-02" title="Password reset / पासवर्ड रीसेट">
        {hasSupabaseEnv() ? (
          <ForgotPasswordForm next={next} initialError={error} />
        ) : (
          <Notice kind="warn">Password reset is unavailable: Supabase is not configured.</Notice>
        )}
        <p className="mt-5 border-t border-border pt-4 text-sm text-muted">
          Remembered it?{" "}
          <Link href={loginHref} className={`font-semibold text-accent hover:underline ${FOCUS}`}>
            Back to sign in
          </Link>
        </p>
      </FormSlip>
    </AuthShell>
  );
}
