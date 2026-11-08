import { test, expect } from "@playwright/test";
import { mockAnalysis } from "./helpers/analysis";

test.beforeEach(async ({ page }) => mockAnalysis(page));
test("saved same-period comparison reports actual daily and monthly rankings with limitations", async ({
  page,
}) => {
  await page.goto("./#performance");
  await expect(
    page.getByRole("heading", { name: "Model performance", exact: true }),
  ).toBeVisible();
  const section = page.locator("#performance");
  await expect(section).toContainText(
    "TVB forecast’s creation date is unknown",
  );
  await expect(section).toContainText("common-day coverage is not recorded");
  const windows = section.locator(".di-performance-window");
  await expect(windows).toHaveCount(2);
  await expect(windows.nth(0)).toContainText("1 Nov 2025 – 30 Apr 2026");
  await expect(windows.nth(1)).toContainText("1 May 2026 – 31 Oct 2026");
  await expect(windows.nth(0)).toContainText("8.5%");
  await expect(windows.nth(0)).toContainText("5.5%");
  await expect(windows.nth(0)).toContainText(
    "TVB has lower reported error by 2.96 percentage points",
  );
  await expect(windows.nth(1)).toContainText("TVB has lower reported error");
  await section
    .getByRole("button", { name: "Monthly average error", exact: true })
    .click();
  await expect(windows.nth(0)).toContainText("3.7%");
  await expect(windows.nth(0)).toContainText("6.1%");
  await expect(windows.nth(0)).toContainText(
    "Our model has lower reported error",
  );
  await expect(windows.nth(1)).toContainText(
    "Our model has lower reported error",
  );
  await section
    .getByRole("button", { name: "Peak-day weighted error", exact: true })
    .click();
  await expect(windows.nth(1)).toContainText(
    "No paired score for this metric; no ranking shown",
  );
  await expect(windows.nth(1)).toContainText("Unavailable");
  await section
    .getByText("Exact reported scores, evaluation periods and provenance", {
      exact: true,
    })
    .click();
  await expect(section.getByRole("table")).toBeVisible();
  await expect(section).toContainText(
    "Daily error masks missing predictions separately per model",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});
test("analysis filters do not relabel historical backtest periods", async ({
  page,
}) => {
  await page.goto("./#data");
  await page.getByLabel("Analysis period preset").selectOption("Summer 2027");
  await page.getByLabel("Origin market", { exact: true }).selectOption("BE");
  await page
    .getByRole("navigation", { name: "Data sections" })
    .getByRole("link", { name: /Model performance/ })
    .click();
  await expect(page).toHaveURL(/#performance$/);
  await expect(page.locator("#performance")).toContainText(
    "1 Nov 2025 – 30 Apr 2026",
  );
  await expect(page.locator("#performance")).toContainText(
    "1 May 2026 – 31 Oct 2026",
  );
});
