import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const isPreview = process.env.VERCEL_ENV === "preview";

/** Supabase host for REST/Auth (https) and Realtime (wss). */
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host || "*.supabase.co";
  } catch {
    return "*.supabase.co";
  }
})();

// Vercel's preview toolbar loads from vercel.live; only allow it on preview deployments.
const vercelLive = isPreview ? " https://vercel.live" : "";

/**
 * 'unsafe-inline' scripts are required by Next's inline bootstrap without a nonce; inline styles by
 * Recharts/React style props. The MapLibre module worker is served from /maplibre (worker-src 'self')
 * and fetches vector tiles + glyphs from OpenFreeMap (connect-src).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${vercelLive}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${vercelLive}`,
  "font-src 'self'",
  `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://tiles.openfreemap.org${vercelLive}`,
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  `frame-src ${isPreview ? "https://vercel.live" : "'none'"}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
