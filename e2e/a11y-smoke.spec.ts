import { expect, test } from "@playwright/test";

test.describe("a11y smoke", () => {
  test("every header/nav link is reachable by Tab and has an accessible name", async ({ page }) => {
    await page.goto("/");

    // The site header (banner landmark) holds the brand link, the main nav and the account link.
    const banner = page.getByRole("banner");
    await expect(banner.getByRole("navigation")).toBeVisible();
    const links = banner.getByRole("link");
    const count = await links.count();
    expect(count).toBeGreaterThan(1);

    for (let i = 0; i < count; i++) {
      const link = links.nth(i);
      const href = await link.getAttribute("href");
      await expect(link, `header link #${i} (${href}) needs an accessible name`).toHaveAccessibleName(/\S/);
    }

    // Tab from the top of the document; record which header links (by position) receive focus.
    await page.locator("body").focus();
    const reached = new Set<number>();
    for (let i = 0; i < count + 10 && reached.size < count; i++) {
      await page.keyboard.press("Tab");
      const idx = await page.evaluate(() => {
        const header = document.querySelector("body > header");
        if (!header) return -1;
        return Array.from(header.querySelectorAll("a[href]")).indexOf(document.activeElement as Element);
      });
      if (idx >= 0) reached.add(idx);
    }
    expect([...reached].sort((a, b) => a - b)).toEqual([...Array(count).keys()]);
  });
});
