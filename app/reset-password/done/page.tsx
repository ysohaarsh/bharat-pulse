import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell, FormSlip } from "@/components/auth/form-slip";
import { Notice } from "@/components/auth/notice";
import { BTN_PRIMARY } from "@/components/auth/styles";
import { safeNext } from "../../auth/safe-next";

export const metadata: Metadata = { title: "Password updated — Bharat Pulse" };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Success screen after /reset-password (post-redirect-get, so a refresh can't resubmit). */
export default async function PasswordUpdatedPage({ searchParams }: PageProps<"/reset-password/done">) {
  const next = safeNext(first((await searchParams).next));

  return (
    <AuthShell title="Password updated">
      <FormSlip formNo="BP-03" title="Receipt / पावती">
        <div className="flex flex-col gap-4">
          <Notice kind="ok">
            Your password has been changed and you&apos;re signed in. Other devices have been signed out.
          </Notice>
          <Link href={next} className={BTN_PRIMARY}>
            Continue to Bharat Pulse
          </Link>
        </div>
      </FormSlip>
    </AuthShell>
  );
}
