const HOUR_MS = 3_600_000;

export interface Period {
  start: Date;
  end: Date;
}

/** The 24h window ending at the most recent full UTC hour at or before `now`. Pure. */
export function defaultPeriod(now: Date = new Date()): Period {
  const end = new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
  return { start: new Date(end.getTime() - 24 * HOUR_MS), end };
}

/** 24h window ending exactly at `end`. */
export function periodEndingAt(end: Date): Period {
  return { start: new Date(end.getTime() - 24 * HOUR_MS), end };
}
