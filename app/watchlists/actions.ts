"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/components/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  parseWatchlistForm,
  readWatchlistForm,
  type WatchlistFieldErrors,
  type WatchlistFormValues,
} from "@/lib/watchlists/schema";

export interface WatchlistFormState {
  fieldErrors?: WatchlistFieldErrors;
  error?: string;
  /** Submitted values, echoed so the form keeps them after a failed submit. */
  values?: WatchlistFormValues;
  /** Increments on each successful create so the client can reset the form. */
  savedCount?: number;
}

function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]): WatchlistFieldErrors {
  const out: WatchlistFieldErrors = {};
  for (const issue of issues) {
    const key = String(issue.path[0]) as keyof WatchlistFieldErrors;
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

function validId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

/** DB limit violations (see migration 20261005000000) get a friendly message; anything else is logged, not shown. */
function saveErrorMessage(error: { code?: string; message: string }): string {
  if (error.message.includes("watchlist limit reached")) return "You can have up to 20 watchlists. Delete one to add another.";
  console.error("[watchlists] save failed:", error.code, error.message);
  return error.code === "23514" ? "That watchlist exceeds the allowed limits." : "Couldn't save the watchlist. Please try again.";
}

export async function createWatchlist(prev: WatchlistFormState, formData: FormData): Promise<WatchlistFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fwatchlists");

  const parsed = parseWatchlistForm(formData);
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues), values: readWatchlistForm(formData), savedCount: prev.savedCount };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("watchlists").insert({ ...parsed.data, user_id: user.id });
  if (error) return { error: saveErrorMessage(error), values: readWatchlistForm(formData), savedCount: prev.savedCount };

  revalidatePath("/watchlists");
  return { savedCount: (prev.savedCount ?? 0) + 1 };
}

export async function updateWatchlist(
  id: number,
  _prev: WatchlistFormState,
  formData: FormData,
): Promise<WatchlistFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fwatchlists");
  if (!validId(id)) return { error: "Unknown watchlist." };

  const parsed = parseWatchlistForm(formData);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues), values: readWatchlistForm(formData) };

  const supabase = await createClient();
  // RLS restricts to the owner; the explicit user filter is defence in depth.
  const { data, error } = await supabase
    .from("watchlists")
    .update(parsed.data)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");
  if (error) return { error: saveErrorMessage(error), values: readWatchlistForm(formData) };
  if (!data || data.length === 0) return { error: "Watchlist not found.", values: readWatchlistForm(formData) };

  revalidatePath("/watchlists");
  redirect("/watchlists");
}

export async function deleteWatchlist(id: number): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fwatchlists");
  if (!validId(id)) return;

  const supabase = await createClient();
  const { error } = await supabase.from("watchlists").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    console.error("[watchlists] delete failed:", error.message);
    throw new Error("Couldn't delete watchlist. Please try again.");
  }

  revalidatePath("/watchlists");
  revalidatePath("/alerts");
  revalidatePath("/", "layout");
}
