import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { AlertsBadge } from "@/components/auth/alerts-badge";
import { getCurrentUser } from "@/components/auth/session";
import { FOCUS } from "@/components/auth/styles";
import { UtcClock } from "@/components/hud/utc-clock";
import { NavTabs, type NavTab } from "@/components/nav-tabs";
import { createClient } from "@/lib/supabase/server";

async function unreadAlertCount(userId: string): Promise<number> {
  try {
    const supabase = await createClient();
    const { count } = await supabase
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function Nav() {
  const user = await getCurrentUser();
  const unread = user ? await unreadAlertCount(user.id) : 0;

  const tabs: NavTab[] = [
    { href: "/", label: "Map" },
    { href: "/brief", label: "World Brief" },
    { href: "/stats", label: "Stats" },
    { href: "/watchlists", label: "Watchlists" },
  ];
  if (user) {
    tabs.push({ href: "/alerts", label: "Alerts", extra: <AlertsBadge userId={user.id} initialCount={unread} /> });
  }

  return (
    <header className="relative flex h-11 shrink-0 items-stretch gap-3 whitespace-nowrap border-b border-border-strong bg-surface/95 pl-3 pr-3 text-xs sm:gap-5">
      <Link href="/" className={`flex shrink-0 items-center gap-2 ${FOCUS}`}>
        <span aria-hidden className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-50" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />
        </span>
        <span className="glow text-sm font-bold tracking-[0.3em] text-accent">PULSE</span>
        <span className="hidden text-[10px] tracking-[0.2em] text-muted lg:inline">{"// GLOBAL SITUATION MONITOR"}</span>
      </Link>

      <NavTabs tabs={tabs} />

      <div className="ml-auto flex shrink-0 items-center gap-4">
        <span className="hidden items-center gap-1.5 text-[10px] tracking-[0.16em] text-muted xl:flex">
          SYS <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]" />
          <span className="text-accent">NOMINAL</span>
        </span>
        <UtcClock className="hidden text-[11px] text-foreground md:inline" />
        {user ? (
          <div className="flex items-center gap-3">
            <span className="hidden max-w-40 truncate text-muted sm:inline" title={user.email ?? undefined}>
              {user.email ?? "Signed in"}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className={`border border-border px-2 py-1 uppercase tracking-widest text-muted hover:border-accent hover:text-accent ${FOCUS}`}
              >
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/login"
            className={`border border-border-strong px-2.5 py-1 uppercase tracking-widest text-accent hover:bg-accent hover:text-black ${FOCUS}`}
          >
            Sign in
          </Link>
        )}
      </div>
      <span aria-hidden className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
    </header>
  );
}
