import { describe, expect, it } from "vitest";
import { buildVitals } from "./vitals";

const NOW = Date.parse("2026-10-05T06:00:00Z");
const at = (mins: number) => new Date(NOW - mins * 60_000).toISOString();

describe("buildVitals", () => {
  const rows = [
    { key: "power.demand", region: "IN", label: "", value: 218, state: null, observed_at: at(5) },
    { key: "power.demand_yesterday", region: "IN", label: "", value: 220, state: null, observed_at: at(5) },
    { key: "power.price", region: "IN", label: "", value: 7.6, state: null, observed_at: at(5) },
    { key: "aqi", region: "cpcb:A", label: "Anand Vihar", value: 412, state: "IN-DL", observed_at: at(30), meta: { city: "Delhi" } },
    { key: "aqi", region: "cpcb:B", label: "Lodhi Road", value: 305, state: "IN-DL", observed_at: at(30), meta: { city: "Delhi" } },
    { key: "aqi", region: "model:Patna", label: "Patna", value: 250.4, state: "IN-BR", observed_at: at(30), meta: { city: "Patna", modelled: true } },
    { key: "mandi:Tomato", region: "IN", label: "", value: 1800, state: null, observed_at: at(600) },
    { key: "mandi:Onion", region: "IN", label: "", value: 2550, state: null, observed_at: at(600) },
    { key: "mandi:Onion", region: "IN-MH", label: "", value: 2200, state: "IN-MH", observed_at: at(600) },
  ];

  it("summarises power, the worst air per city and national mandi prices", () => {
    const v = buildVitals(rows, [{ value: 210 }, { value: 218 }], NOW);
    expect(v.power).toMatchObject({ demand: 218, demandYesterday: 220, price: 7.6, history: [210, 218] });
    expect(v.worstAir).toEqual([
      { city: "Delhi", state: "IN-DL", aqi: 412, modelled: false },
      { city: "Patna", state: "IN-BR", aqi: 250, modelled: true },
    ]);
    expect(v.mandi.map((m) => [m.commodity, m.price])).toEqual([
      ["Onion", 2550],
      ["Tomato", 1800],
    ]);
  });

  it("hides a stale power reading", () => {
    const stale = rows.map((r) => (r.key.startsWith("power") ? { ...r, observed_at: at(300) } : r));
    expect(buildVitals(stale, [], NOW).power.demand).toBeNull();
  });
});
