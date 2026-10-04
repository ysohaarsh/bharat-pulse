import { expect, test } from "@playwright/test";
import { collectErrors, HAS_DB } from "./helpers";

test.describe("brief", () => {
  test("renders a brief or the empty state, plus top events", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/brief");

    await expect(page).toHaveTitle(/Pulse/);
    await expect(page.getByRole("heading", { level: 1, name: "World Brief" })).toBeVisible();

    if (HAS_DB) {
      // Either a generated brief (article labelled by its period heading) or the documented empty state.
      const brief = page.getByRole("article");
      const empty = page.getByRole("heading", { name: "No brief yet" });
      await expect(brief.or(empty).first()).toBeVisible();
      await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    }

    const top = page.getByRole("region", { name: "Top events in this period" });
    await expect(top).toBeVisible();
    await expect(top.getByRole("heading", { name: "Top events in this period" })).toBeVisible();
    if (HAS_DB) {
      await expect(top.getByRole("listitem").first().or(top.getByText("No events recorded in this period yet."))).toBeVisible();
    }

    await expect(page.getByRole("complementary").getByRole("heading", { name: "Previous briefs" })).toBeVisible();
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
