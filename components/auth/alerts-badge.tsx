"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Unread alert count. Starts from the server count and refreshes the route when
 * Realtime reports a new alert for this user (RLS limits the stream to own rows).
 */
export function AlertsBadge({ userId, initialCount }: { userId: string; initialCount: number }) {
  const router = useRouter();
  const [bump, setBump] = useState({ base: initialCount, extra: 0 });
  // Reset local increments whenever the server sends a fresh count.
  if (bump.base !== initialCount) setBump({ base: initialCount, extra: 0 });
  const count = bump.base + bump.extra;

  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }
    const channel = supabase
      .channel(`alerts:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alerts", filter: `user_id=eq.${userId}` },
        () => {
          setBump((b) => ({ ...b, extra: b.extra + 1 }));
          router.refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, router]);

  if (count <= 0) return null;
  return (
    <span className="ml-1 inline-flex min-w-4 items-center justify-center rounded-full bg-danger px-1 font-mono text-[10px] leading-4 text-foreground">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> unread</span>
    </span>
  );
}
