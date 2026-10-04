import { expect, test, type Page } from "@playwright/test";
import { collectErrors } from "./helpers";

const EMPTY_STATE = /No events (yet|match these filters)\./;

function feed(page: Page) {
  return page.getByRole("complementary", { name: "Live event feed" });
}

function categories(page: Page) {
  return feed(page).getByRole("group", { name: "Categories" });
}

function sportsChip(page: Page) {
  return categories(page).getByRole("button", { name: "Sports (opt-in) events" });
}

async function waitForFeed(page: Page): Promise<void> {
  const cards = feed(page).getByRole("list", { name: "Event feed" }).getByRole("button");
  await expect(cards.first().or(feed(page).getByText(EMPTY_STATE))).toBeVisible();
}

test.describe("sports opt-in feed", () => {
  test("toggling Sports sets ?sports=1, survives reload, and toggles back off", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await waitForFeed(page);
    await expect(sportsChip(page)).toHaveAttribute("aria-pressed", "false");

    await sportsChip(page).click();
    await expect(page).toHaveURL(/[?&]sports=1(&|$)/);
    await expect(sportsChip(page)).toHaveAttribute("aria-pressed", "true");
    // Opting in to sports doesn't narrow the other categories.
    expect(new URL(page.url()).searchParams.get("cat")).toBeNull();
    await expect(categories(page).getByRole("button", { name: /^All categories/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.reload();
    await waitForFeed(page);
    await expect(sportsChip(page)).toHaveAttribute("aria-pressed", "true");

    await sportsChip(page).click();
    await expect(sportsChip(page)).toHaveAttribute("aria-pressed", "false");
    await expect(page).not.toHaveURL(/sports=/);

    await page.waitForLoadState("networkidle").catch(() => {});
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("a sports-only link shows nothing but sports", async ({ page }) => {
    await page.goto("/?cat=sports");
    await waitForFeed(page);
    await expect(sportsChip(page)).toHaveAttribute("aria-pressed", "true");
    await expect(categories(page).getByRole("button", { name: "Earthquake events" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    const cards = feed(page).getByRole("list", { name: "Event feed" }).getByRole("button");
    const count = await cards.count();
    for (let i = 0; i < Math.min(count, 10); i++) {
      await expect(cards.nth(i)).toContainText("[SPORTS]");
    }
  });

  test("the SITREP ignores sports even when they are shown", async ({ page }) => {
    await page.goto("/?sports=1");
    await waitForFeed(page);
    const sitrep = page.getByLabel("Situation report");
    await expect(sitrep.getByRole("button", { name: /^Show only Earthquake/ })).toBeVisible();
    await expect(sitrep.getByRole("button", { name: /^Show only Sports/ })).toHaveCount(0);
    await expect(sitrep.getByText("SPORTS", { exact: true })).toHaveCount(0);
  });

  test("/stats leaves sports out", async ({ page }) => {
    await page.goto("/stats");
    await expect(page.getByRole("heading", { level: 1, name: "Stats" })).toBeVisible();
    await expect(page.getByRole("main").getByText("Sports RSS")).toHaveCount(0);
  });
});
