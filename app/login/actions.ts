"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/components/auth/session";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "../auth/safe-next";
import { firstErrors, magicLinkSchema, signInSchema, signUpSchema, type AuthFormState } from "./schema";

const UNAVAILABLE: AuthFormState = { error: "Sign-in is unavailable: Supabase is not configured." };

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

/** Absolute site origin for email links. Supabase still checks it against the allowed redirect URLs. */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function confirmUrl(next: string): Promise<string> {
  const url = new URL("/auth/confirm", await siteOrigin());
  url.searchParams.set("next", next);
  return url.toString();
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const next = safeNext(field(formData, "next"));
  const raw = { email: field(formData, "email"), password: field(formData, "password") };
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: firstErrors(parsed.error), email: raw.email };
  if (!hasSupabaseEnv()) return { ...UNAVAILABLE, email: raw.email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message, email: raw.email };

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const next = safeNext(field(formData, "next"));
  const raw = { email: field(formData, "email"), password: field(formData, "password") };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: firstErrors(parsed.error), email: raw.email };
  if (!hasSupabaseEnv()) return { ...UNAVAILABLE, email: raw.email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: await confirmUrl(next) },
  });
  if (error) return { error: error.message, email: raw.email };

  if (!data.session) {
    return {
      message: `Check your email to confirm your account. We sent a link to ${parsed.data.email}.`,
      email: raw.email,
    };
  }
  revalidatePath("/", "layout");
  redirect(next);
}

export async function sendMagicLink(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const next = safeNext(field(formData, "next"));
  const raw = { email: field(formData, "email") };
  const parsed = magicLinkSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: firstErrors(parsed.error), email: raw.email };
  if (!hasSupabaseEnv()) return { ...UNAVAILABLE, email: raw.email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: await confirmUrl(next) },
  });
  if (error) return { error: error.message, email: raw.email };
  return { message: `Magic link sent to ${parsed.data.email}. Open it on this device to sign in.`, email: raw.email };
}
