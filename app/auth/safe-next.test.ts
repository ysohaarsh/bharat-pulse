import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNext("/watchlists")).toBe("/watchlists");
    expect(safeNext("/?cat=storm&sev=2#x")).toBe("/?cat=storm&sev=2#x");
  });

  it("rejects open redirects and junk", () => {
    for (const bad of [
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "evil.com",
      "",
      undefined,
      null,
      42,
    ]) {
      expect(safeNext(bad)).toBe("/");
    }
  });

  it("uses the provided fallback", () => {
    expect(safeNext("//x", "/alerts")).toBe("/alerts");
  });
});
