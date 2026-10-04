import { expect, test } from "@playwright/test";
import { collectErrors, HAS_DB } from "./helpers";

const KPI_LABELS = ["Total events", /High severity/, "Countries affected", "Most active category"];

test.describe("stats", () => {
  test("renders KPIs", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/stats");

    await expect(page).toHaveTitle(/Pulse/);
    await expect(page.getByRole("heading", { level: 1, name: "Stats" })).toBeVisible();
    for (const label of KPI_LABELS) {
      await expect(page.getByRole("term").filter({ hasText: label })).toBeVisible();
    }
    // Numeric KPI values render as numbers (0 is fine on an empty DB).
    const total = page.getByRole("term").filter({ hasText: "Total events" }).locator("xpath=following-sibling::dd[1]");
    await expect(total).toHaveText(/^\d[\d,]*$/);

    if (HAS_DB) await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("window toggle switches to 7 days", async ({ page }) => {
    await page.goto("/stats");
    const toggle = page.getByRole("navigation", { name: "Time window" });
    await expect(toggle.getByRole("link", { name: "24 hours" })).toHaveAttribute("aria-current", "page");

    await toggle.getByRole("link", { name: "7 days" }).click();
    await expect(page).toHaveURL(/[?&]window=7d/);
    await expect(toggle.getByRole("link", { name: "7 days" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(/over the last 7 days/)).toBeVisible();
  });
});
