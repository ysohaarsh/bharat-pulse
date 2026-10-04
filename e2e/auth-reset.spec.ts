import { expect, test } from "@playwright/test";
import { collectErrors, skipWithoutDb } from "./helpers";

// Password-reset flow. Never submit a valid email here: that would make Supabase send a real email.
test.describe("password reset", () => {
  test("login page links to /forgot-password from the Sign in tab, preserving next", async ({ page }) => {
    skipWithoutDb();
    const errors = collectErrors(page);
    await page.goto("/login?next=/watchlists");

    const link = page.getByRole("link", { name: "Forgot password?" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/forgot-password?next=%2Fwatchlists");

    // Only offered on the Sign in tab.
    await page.getByRole("tab", { name: "Create account" }).click();
    await expect(link).toBeHidden();
    await page.getByRole("tab", { name: "Sign in" }).click();

    await link.click();
    await expect(page).toHaveURL(/\/forgot-password\?next=%2Fwatchlists$/);
    await expect(page.getByRole("heading", { level: 1, name: "Reset password" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/login?next=%2Fwatchlists",
    );
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("/forgot-password shows an inline error for an invalid email", async ({ page }) => {
    skipWithoutDb();
    const errors = collectErrors(page);
    await page.goto("/forgot-password");
    await expect(page).toHaveTitle(/Reset password — Pulse/);

    const email = page.getByLabel("Email");
    await email.fill("not-an-email");
    await page.getByRole("button", { name: "Send reset link" }).click();

    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveValue("not-an-email");
    // Validation failed before Supabase was called: no "sent" status.
    await expect(page.getByRole("status")).toHaveCount(0);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("/forgot-password renders only known error codes", async ({ page }) => {
    skipWithoutDb();
    await page.goto("/forgot-password?error=link_invalid");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("That reset link is invalid or has expired");

    await page.goto("/forgot-password?error=%3Cb%3Ehello%3C%2Fb%3E");
    await expect(page.getByRole("heading", { level: 1, name: "Reset password" })).toBeVisible();
    await expect(page.getByText("hello")).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  });

  test("/reset-password without a session redirects to request a new link", async ({ page }) => {
    skipWithoutDb();
    await page.goto("/reset-password?next=/watchlists");
    await expect(page).toHaveURL(/\/forgot-password\?error=session_missing&next=%2Fwatchlists$/);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Your reset link has expired or was already used");
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("a broken recovery link in /auth/confirm falls back to /forgot-password", async ({ page }) => {
    skipWithoutDb();
    // No code / token_hash at all.
    await page.goto("/auth/confirm?next=%2Freset-password");
    await expect(page).toHaveURL(/\/forgot-password\?error=link_incomplete$/);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("That reset link is incomplete");

    // A bogus PKCE code (no verifier cookie in this browser) — fails before any email is involved.
    await page.goto("/auth/confirm?code=bogus&next=%2Freset-password%3Fnext%3D%252Fwatchlists");
    await expect(page).toHaveURL(/\/forgot-password\?error=link_invalid&next=%2Fwatchlists$/);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("That reset link is invalid or has expired");
  });

  test("/reset-password/done offers a way back", async ({ page }) => {
    await page.goto("/reset-password/done?next=//evil.example");
    await expect(page.getByRole("heading", { level: 1, name: "Password updated" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue to Pulse" })).toHaveAttribute("href", "/");
  });
});
