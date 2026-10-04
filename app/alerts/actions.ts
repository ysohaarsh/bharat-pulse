"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/components/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function markAlertRead(id: number): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Falerts");
  if (!Number.isSafeInteger(id) || id <= 0) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("alerts")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) {
    console.error("[alerts] mark read failed:", error.message);
    throw new Error("Couldn't mark the alert as read. Please try again.");
  }
  revalidatePath("/", "layout");
}

export async function markAllAlertsRead(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Falerts");

  const supabase = await createClient();
  const { error } = await supabase
    .from("alerts")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) {
    console.error("[alerts] mark all read failed:", error.message);
    throw new Error("Couldn't mark alerts as read. Please try again.");
  }
  revalidatePath("/", "layout");
}
