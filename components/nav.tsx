import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { AlertsBadge } from "@/components/auth/alerts-badge";
import { getCurrentUser } from "@/components/auth/session";
import { Chakra } from "@/components/hud/ornaments";
import { IstClock } from "@/components/hud/ist-clock";
import { LangToggle } from "@/components/i18n/lang-provider";
import { NavTabs, type NavTab } from "@/components/nav-tabs";
import { t } from "@/lib/i18n/dict";
import { getLang } from "@/lib/i18n/server";
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
  const [user, lang] = await Promise.all([getCurrentUser(), getLang()]);
  const unread = user ? await unreadAlertCount(user.id) : 0;

  const tabs: NavTab[] = [
    { href: "/", label: t(lang, "navMap") },
    { href: "/brief", label: t(lang, "navBrief") },
    { href: "/stats", label: t(lang, "navStats") },
    { href: "/report", label: t(lang, "navReport") },
    { href: "/watchlists", label: t(lang, "navWatchlists") },
  ];
  if (user) {
    tabs.push({ href: "/alerts", label: t(lang, "navAlerts"), extra: <AlertsBadge userId={user.id} initialCount={unread} /> });
  }

  const NAV_FOCUS =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-soft focus-visible:ring-offset-1 focus-visible:ring-offset-maroon";

  return (
    <header className="relative z-20 shrink-0">
      <div className="flex h-11 items-stretch gap-3 whitespace-nowrap bg-maroon pl-3 pr-3 text-xs text-cream sm:gap-5">
        <Link href="/" className={`flex shrink-0 items-center gap-2 ${NAV_FOCUS}`}>
          <Chakra className="h-6 w-6 text-gold-soft" />
          <span className="font-display text-[19px] leading-none tracking-wide text-gold-soft">Bharat Pulse</span>
          <span className="font-display hidden text-[13px] leading-none text-cream/80 sm:inline" lang="hi">
            भारत पल्स
          </span>
          <span className="hidden text-[10px] uppercase tracking-[0.18em] text-cream/60 2xl:inline">{t(lang, "brandTag")}</span>
        </Link>

        <NavTabs tabs={tabs} />

        <div className="ml-auto flex shrink-0 items-center gap-4">
          <span className="hidden items-center gap-1.5 text-[11px] text-cream/80 xl:flex">
            <span lang="hi">बही खुली</span>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#8fd16a]" />
            <span className="num text-[10px] tracking-[0.14em] text-[#b6e39a]">OPEN</span>
          </span>
          <IstClock className="hidden text-[11px] text-cream md:inline" />
          <LangToggle
            className={`border border-gold/70 px-2 py-1 text-[11px] font-semibold text-gold-soft hover:bg-gold-soft hover:text-maroon-deep disabled:opacity-50 ${NAV_FOCUS}`}
          />
          {user ? (
            <div className="flex items-center gap-3">
              <span className="hidden max-w-40 truncate text-cream/70 sm:inline" title={user.email ?? undefined}>
                {user.email ?? "Signed in"}
              </span>
              <form action={signOut}>
                <button
                  type="submit"
                  className={`border border-gold/70 px-2 py-1 text-[11px] font-semibold uppercase tracking-widest text-gold-soft hover:bg-gold-soft hover:text-maroon-deep ${NAV_FOCUS}`}
                >
                  {t(lang, "signOut")}
                </button>
              </form>
            </div>
          ) : (
            <Link
              href="/login"
              className={`border border-gold-soft bg-maroon-deep px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-gold-soft hover:bg-gold-soft hover:text-maroon-deep ${NAV_FOCUS}`}
            >
              {t(lang, "signIn")}
            </Link>
          )}
        </div>
      </div>
      <div aria-hidden className="band-print" />
      <div aria-hidden className="toran absolute inset-x-0 top-full" />
    </header>
  );
}
