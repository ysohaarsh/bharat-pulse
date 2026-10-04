import type { Metadata } from "next";
import Link from "next/link";
import { BTN_PRIMARY } from "@/components/auth/styles";
import { safeNext } from "../../auth/safe-next";

export const metadata: Metadata = { title: "Password updated — Pulse" };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Success screen after /reset-password (post-redirect-get, so a refresh can't resubmit). */
export default async function PasswordUpdatedPage({ searchParams }: PageProps<"/reset-password/done">) {
  const next = safeNext(first((await searchParams).next));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-sm px-4 py-10">
        <header className="mb-6">
          <h1 className="glow text-lg font-bold uppercase tracking-[0.25em] text-accent">Password updated</h1>
        </header>
        <section className="hud-panel flex flex-col gap-4 p-5">
          <p role="status" className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
            Your password has been changed and you&apos;re signed in. Other devices have been signed out.
          </p>
          <Link href={next} className={BTN_PRIMARY}>
            Continue to Pulse
          </Link>
        </section>
      </div>
    </div>
  );
}
