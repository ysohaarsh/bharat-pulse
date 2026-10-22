"use client";

import { useEffect, useState } from "react";
import { parseFlightPositions, type FlightSnapshot } from "@/lib/flights/positions";
import { createClient } from "@/lib/supabase/client";

export type FlightStatus = "idle" | "ok" | "empty" | "error";

const POLL_MS = 5 * 60_000;

async function loadFlights(): Promise<FlightSnapshot | null> {
  // The positions row (~30 KB) is read on its own, never together with the vitals counts.
  const { data, error } = await createClient().from("metrics").select("meta, observed_at").eq("key", "flights.positions").single();
  if (error || !data) return null;
  return parseFlightPositions(data.meta, data.observed_at);
}

/** Latest OpenSky snapshot: fetched when `active`, refreshed every 5 min (the relay writes every 30). */
export function useFlights(active: boolean): { snapshot: FlightSnapshot | null; status: FlightStatus } {
  const [state, setState] = useState<{ snapshot: FlightSnapshot | null; status: FlightStatus }>({ snapshot: null, status: "idle" });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const load = () => {
      if (document.hidden) return;
      loadFlights()
        .then((snapshot) => !cancelled && setState((s) => ({ snapshot: snapshot ?? s.snapshot, status: snapshot || s.snapshot ? "ok" : "empty" })))
        .catch(() => !cancelled && setState((s) => ({ ...s, status: s.snapshot ? "ok" : "error" })));
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active]);

  return active ? state : { snapshot: null, status: "idle" };
}
