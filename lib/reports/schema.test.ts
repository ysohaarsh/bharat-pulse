import { describe, expect, it } from "vitest";
import { reportPhotoUrl } from "./kinds";
import { photoPath, photoProblem, pointFromParams, reportSchema } from "./schema";

describe("reportSchema", () => {
  it("accepts a valid pothole report inside India", () => {
    const r = reportSchema.safeParse({ kind: "pothole", description: "  Big pothole near bus stop ", lat: 12.97, lng: 77.59 });
    expect(r.success && r.data.description).toBe("Big pothole near bus stop");
  });

  it("rejects unknown kinds, empty text and points outside India", () => {
    expect(reportSchema.safeParse({ kind: "ufo", description: "hmm", lat: 12, lng: 77 }).success).toBe(false);
    expect(reportSchema.safeParse({ kind: "garbage", description: " ", lat: 12, lng: 77 }).success).toBe(false);
    expect(reportSchema.safeParse({ kind: "garbage", description: "Overflowing bin", lat: 51.5, lng: -0.1 }).success).toBe(false);
  });
});

describe("photos", () => {
  it("checks type and size", () => {
    expect(photoProblem(null)).toBeNull();
    expect(photoProblem({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(photoProblem({ type: "image/gif", size: 1000 })).toMatch(/JPEG/);
    expect(photoProblem({ type: "image/png", size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
  });

  it("stores photos in the reporter's folder and builds public URLs", () => {
    expect(photoPath("u1", "image/png", "abc")).toBe("u1/abc.png");
    expect(photoPath("u1", "image/jpeg", "abc")).toBe("u1/abc.jpg");
    expect(reportPhotoUrl("https://x.supabase.co", "u1/abc.jpg")).toBe(
      "https://x.supabase.co/storage/v1/object/public/report-photos/u1/abc.jpg",
    );
    expect(reportPhotoUrl("https://x.supabase.co", null)).toBeNull();
  });
});

describe("pointFromParams", () => {
  it("parses in-India coordinates only", () => {
    expect(pointFromParams("12.9", "77.6")).toEqual({ lat: 12.9, lng: 77.6 });
    expect(pointFromParams(["12.9"], ["77.6"])).toEqual({ lat: 12.9, lng: 77.6 });
    expect(pointFromParams("51.5", "-0.1")).toBeNull();
    expect(pointFromParams(undefined, undefined)).toBeNull();
  });
});
