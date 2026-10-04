import { expect, test, type Page } from "@playwright/test";
import { collectErrors, skipWithoutDb } from "./helpers";

const EMPTY_STATE = /No events (yet|match these filters)\./;

function feed(page: Page) {
  return page.getByRole("complementary", { name: "Live event feed" });
}

function eventCards(page: Page) {
  return feed(page).getByRole("list", { name: "Event feed" }).getByRole("button");
}

/** Waits until the feed shows either event cards or the empty state; returns the card count. */
async function waitForFeed(page: Page): Promise<number> {
  const cards = eventCards(page);
  await expect(cards.first().or(feed(page).getByText(EMPTY_STATE))).toBeVisible();
  return cards.count();
}

test.describe("home", () => {
  test("loads with map, feed and no console errors", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");

    await expect(page).toHaveTitle(/Pulse/);
    await expect(page.getByRole("region", { name: "Event map" }).locator(".maplibregl-canvas")).toBeVisible();
    await expect(feed(page).getByRole("heading", { name: "Live feed" })).toBeVisible();
    await waitForFeed(page);

    // Give hydration + realtime subscription a moment to surface any client errors.
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("category chip updates the URL and filters the feed", async ({ page }) => {
    skipWithoutDb();
    await page.goto("/");
    await waitForFeed(page);

    const chip = feed(page).getByRole("group", { name: "Categories" }).getByRole("button", { name: "Earthquake events" });
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await chip.click();

    await expect(page).toHaveURL(/[?&]cat=/);
    const cat = new URL(page.url()).searchParams.get("cat") ?? "";
    expect(cat.split(",")).not.toContain("earthquake");
    await expect(chip).toHaveAttribute("aria-pressed", "false");

    await waitForFeed(page);
    // The category label on each card is an exact-text span; no card may be an earthquake now.
    await expect(
      feed(page).getByRole("list", { name: "Event feed" }).getByText("Earthquake", { exact: true }),
    ).toHaveCount(0);

    // Reload: the filter comes from the URL and the server-rendered feed respects it too.
    await page.reload();
    await waitForFeed(page);
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await expect(
      feed(page).getByRole("list", { name: "Event feed" }).getByText("Earthquake", { exact: true }),
    ).toHaveCount(0);
  });

  test("sports is opt-in: hidden by default and its chip is not pressed", async ({ page }) => {
    await page.goto("/");
    const categories = feed(page).getByRole("group", { name: "Categories" });
    await expect(categories.getByRole("button", { name: "Sports (opt-in) events" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // "All" means every non-sports category, so it is pressed by default.
    await expect(categories.getByRole("button", { name: /^All categories/ })).toHaveAttribute("aria-pressed", "true");

    await waitForFeed(page);
    const list = feed(page).getByRole("list", { name: "Event feed" });
    await expect(list.getByText("Sports", { exact: true })).toHaveCount(0);
    await expect(list.getByText("[SPORTS]", { exact: true })).toHaveCount(0);
  });

  test("clicking a feed item opens the drawer; Esc closes it", async ({ page }) => {
    skipWithoutDb();
    // Widest window so there is something to click even on a quiet day.
    await page.goto("/?win=7d");
    const count = await waitForFeed(page);
    test.skip(count === 0, "No events in the database to open");

    const cards = eventCards(page);
    let opened = false;
    for (let i = 0; i < Math.min(count, 8); i++) {
      const card = cards.nth(i);
      const cardText = await card.textContent();
      await card.click();

      const drawer = page.getByRole("dialog");
      await expect(drawer).toBeVisible();
      // The drawer is about the clicked event: its title appears on the card.
      const heading = (await drawer.getByRole("heading", { level: 2 }).textContent())?.trim() ?? "";
      expect(heading.length).toBeGreaterThan(0);
      expect(cardText).toContain(heading);
      await expect(drawer.getByRole("button", { name: "Close event details" })).toBeFocused();

      const hasSource = (await drawer.getByRole("link", { name: /Open source/ }).count()) > 0;
      if (hasSource) {
        const link = drawer.getByRole("link", { name: /Open source/ });
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("href", /^https?:\/\//);
      }

      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      if (hasSource) {
        opened = true;
        break;
      }
    }
    expect(opened, "expected at least one of the first events to have an 'Open source' link").toBe(true);
  });
});

test.describe("home layout", () => {
  test("map and feed are both visible", async ({ page }, testInfo) => {
    await page.goto("/");
    const map = page.getByRole("region", { name: "Event map" });
    await expect(map.locator(".maplibregl-canvas")).toBeVisible();
    await expect(feed(page)).toBeVisible();

    if (testInfo.project.name.startsWith("mobile")) {
      // Stacked: map on top, feed below, both full-width.
      const viewport = page.viewportSize()!;
      const m = (await map.boundingBox())!;
      const f = (await feed(page).boundingBox())!;
      expect(f.y).toBeGreaterThanOrEqual(m.y + m.height - 1);
      expect(m.width).toBeGreaterThan(viewport.width * 0.95);
      expect(f.width).toBeGreaterThan(viewport.width * 0.95);
      await feed(page).scrollIntoViewIfNeeded();
      await expect(feed(page).getByRole("heading", { name: "Live feed" })).toBeInViewport();
    }
  });
});
