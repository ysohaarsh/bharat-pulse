import { describe, expect, it } from "vitest";
import { parseFilters } from "@/lib/events/filters";
import { watchlistMapHref } from "./links";

describe("watchlistMapHref", () => {
  it("encodes categories and severity in the home filter params", () => {
    const href = watchlistMapHref({ categories: ["volcano", "earthquake"], min_severity: 3 });
    expect(href).toBe("/?cat=earthquake%2Cvolcano&sev=3&win=7d");
    const parsed = parseFilters(new URLSearchParams(href.slice(2)));
    expect(parsed.categories).toEqual(["earthquake", "volcano"]);
    expect(parsed.minSeverity).toBe(3);
    expect(parsed.window).toBe("7d");
  });

  it("omits cat/sev when they are the defaults", () => {
    expect(watchlistMapHref({ categories: [], min_severity: 1 })).toBe("/?win=7d");
  });
});
