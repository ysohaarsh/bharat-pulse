"use client";

import { useEffect, useState } from "react";
import { aqiBand } from "@/lib/india/aqi";
import { SUPABASE_URL } from "@/lib/env";
import { isReportKind, REPORT_KIND_LABEL, reportPhotoUrl } from "@/lib/reports/kinds";
import { createClient } from "@/lib/supabase/client";
import { EMPTY_OVERLAYS, type LayerKey, type OverlayData } from "./layers";

type Points = GeoJSON.FeatureCollection<GeoJSON.Point>;

const point = (lng: number, lat: number, properties: Record<string, unknown>): GeoJSON.Feature<GeoJSON.Point> => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lng, lat] },
  properties,
});

async function loadProjects(): Promise<Points> {
  const { data } = await createClient().from("projects").select("kind, name, lat, lng, segments, url").limit(5000);
  return { type: "FeatureCollection", features: (data ?? []).map((p) => point(p.lng, p.lat, p)) };
}

async function loadReports(lang: "en" | "hi"): Promise<Points> {
  const since = new Date(Date.now() - 90 * 24 * 3600_000).toISOString();
  const { data } = await createClient()
    .from("reports")
    .select("id, kind, description, lat, lng, status, upvotes, photo_path, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);
  return {
    type: "FeatureCollection",
    features: (data ?? []).map((r) =>
      point(r.lng, r.lat, {
        id: r.id,
        kind: r.kind,
        kindLabel: isReportKind(r.kind) ? REPORT_KIND_LABEL[r.kind][lang] : r.kind,
        description: r.description,
        status: r.status,
        upvotes: r.upvotes,
        photo: reportPhotoUrl(SUPABASE_URL(), r.photo_path),
        when: r.created_at.slice(0, 10),
      }),
    ),
  };
}

async function loadAqi(): Promise<Points> {
  const { data } = await createClient().from("metrics").select("region, label, value, lat, lng, meta").eq("key", "aqi").limit(1000);
  return {
    type: "FeatureCollection",
    features: (data ?? [])
      .filter((m) => m.lat != null && m.lng != null)
      .map((m) =>
        point(m.lng!, m.lat!, {
          label: m.label,
          value: Math.round(m.value),
          band: aqiBand(m.value).label,
          color: aqiBand(m.value).color,
          modelled: Boolean((m.meta as { modelled?: boolean } | null)?.modelled),
        }),
      ),
  };
}

const LOADERS: Partial<Record<LayerKey, (lang: "en" | "hi") => Promise<Points>>> = {
  projects: loadProjects,
  reports: loadReports,
  aqi: loadAqi,
};

/**
 * Overlay points for the map, fetched the first time a layer is switched on and refreshed every
 * 5 minutes while it stays on. `reloadKey` forces a refetch (e.g. after submitting a report).
 */
export function useOverlays(layers: Record<LayerKey, boolean>, lang: "en" | "hi", reloadKey = 0): OverlayData {
  const [data, setData] = useState<OverlayData>(EMPTY_OVERLAYS);
  const enabled = (Object.keys(LOADERS) as (keyof OverlayData)[]).filter((k) => layers[k]).join(",");

  useEffect(() => {
    let cancelled = false;
    const keys = enabled ? (enabled.split(",") as (keyof OverlayData)[]) : [];
    const load = () =>
      keys.forEach((k) =>
        LOADERS[k]!(lang)
          .then((fc) => !cancelled && setData((d) => ({ ...d, [k]: fc })))
          .catch((err) => console.warn(`[overlays] ${k} failed`, err)),
      );
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, lang, reloadKey]);

  return data;
}
