import { test, expect } from "@playwright/test";
// Isolate Overview tests from the pre-existing dashboard's optional live refresh and remote logo/fonts.
test.beforeEach(async ({ page }) => {
  await page.route("https://naechtigungen.pol.joanneum.at/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"forecast_data":[]}',
    }),
  );
  await page.route("https://api.open-meteo.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"daily":{"time":[]}}',
    }),
  );
});
test("all four geographical countries update audience, localized copy, asset and lead time", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  const planner = page.getByRole("region", { name: "AI campaign planner" });
  await expect(
    planner.getByRole("heading", { name: "Germany", exact: true }),
  ).toBeVisible();
  const images = new Set<string>();
  for (const [name, age, lead, language] of [
    ["Germany", "18–24", "60", "de"],
    ["Netherlands", "18–24", "14", "nl"],
    ["Belgium", "18–24", "35", "fr"],
    ["Austria", "18–24", "21", "de"],
  ]) {
    await page
      .getByRole("button", { name: `Select ${name}`, exact: true })
      .click();
    await expect(
      planner.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await expect(planner.locator(".cp-summary")).toContainText(`${age} years`);
    await expect(planner.locator(".cp-summary")).toContainText(`${lead} days`);
    await expect(
      planner.locator(".cp-social-copy > p").first(),
    ).toHaveAttribute("lang", language);
    const image = planner.getByRole("img");
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    images.add((await image.getAttribute("src"))!);
  }
  expect(images.size).toBe(4);
  expect(errors).toEqual([]);
});
test("period-specific approvals are preserved across countries and review is keyboard accessible", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Select Belgium", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cp-plan-title h3")).toHaveText("Belgium");
  await page.getByRole("button", { name: "Review & Schedule" }).click();
  const dialog = page.getByRole("dialog", { name: "Ready for a human yes?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".cp-publishing li")).toHaveCount(3);
  await expect(dialog).toContainText("Europe/Vienna");
  await expect(dialog.locator(".cp-review-post p").first()).toHaveAttribute(
    "lang",
    "fr",
  );
  await dialog
    .getByRole("button", { name: "Approve mock campaign", exact: true })
    .click();
  await expect(
    dialog.getByText("Campaign approved locally", { exact: false }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Review & Schedule" }),
  ).toBeFocused();
  await expect(page.locator(".cp-plan-action")).toContainText(
    "Approved locally",
  );
  await page
    .getByRole("button", { name: "Select Germany", exact: true })
    .focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".cp-plan-title h3")).toHaveText("Germany");
  await expect(page.locator(".cp-plan-action")).not.toContainText(
    "Approved locally",
  );
  await page
    .getByRole("button", { name: "Select Belgium", exact: true })
    .click();
  await expect(page.locator(".cp-plan-action")).toContainText(
    "Approved locally",
  );
  await page
    .getByRole("combobox", { name: "Target travel period" })
    .selectOption("q2-2027");
  await expect(page.locator(".cp-summary")).toContainText("May 2027");
  await expect(page.locator(".cp-summary")).not.toContainText("February");
  await expect(page.locator(".cp-plan-action")).not.toContainText(
    "Approved locally",
  );
  await page
    .getByRole("combobox", { name: "Target travel period" })
    .selectOption("q1-2027");
  await expect(page.locator(".cp-plan-action")).toContainText(
    "Approved locally",
  );
});
test("all periods update all market contexts without stale recommendations", async ({
  page,
}) => {
  await page.goto("./");
  for (const period of ["q1-2027", "q2-2027", "winter-2026-27"]) {
    await page
      .getByRole("combobox", { name: "Target travel period" })
      .selectOption(period);
    for (const [market, month] of [
      ["Germany", "April"],
      ["Netherlands", "April"],
      ["Belgium", "May"],
      ["Austria", "May"],
    ]) {
      await page
        .getByRole("button", { name: `Select ${market}`, exact: true })
        .click();
      await expect(page.locator(".cp-plan-title h3")).toHaveText(market);
      if (period === "q2-2027") {
        await expect(page.locator(".cp-summary")).toContainText(
          `${month === "April" ? "Apr" : month} 2027`,
        );
        await expect(page.locator(".cp-social-image")).toHaveAttribute(
          "alt",
          /spring/,
        );
      } else {
        await expect(page.locator(".cp-social-image")).toHaveAttribute(
          "alt",
          /snow|ski|sledge/,
        );
      }
    }
  }
});
test("existing navigation, Data upload and Actions export remain functional", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("link", { name: "Data", exact: true }).click();
  await expect(page).toHaveURL(/#data$/);
  await expect(
    page.getByRole("heading", { name: "Upload export", exact: true }),
  ).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(1);
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "overview-regression.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "date;actual;forecast;previous_year;beds\n2026-11-06;100;120;110;800",
      ),
    });
  await expect(
    page.getByText("✓ overview-regression.csv", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: /^Actions/ }).click();
  await expect(page).toHaveURL(/#actions$/);
  await expect(page.locator(".actions-min > li").first()).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("next-steps.csv");
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Campaign overview" }),
  ).toBeVisible();
});
for (const size of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
])
  test(`responsive overview ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("./");
    await expect(page.locator(".cp-social-image")).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".cp-social-image")
          .evaluate((node) => (node as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const [map, planner] = await page.evaluate(() =>
      [".cp-map-card", ".cp-planner"].map((selector) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }),
    );
    if (size.width >= 1440) {
      expect(Math.abs(map!.y - planner!.y)).toBeLessThan(2);
      expect(planner!.x).toBeGreaterThan(map!.x + map!.width);
    } else expect(planner!.y).toBeGreaterThan(map!.y + map!.height);
    await page.screenshot({
      path: `test-results/campaign-overview-${size.width}.png`,
      fullPage: true,
    });
  });

test("campaign interactions remain available offline and rapid changes do not show stale data", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Review & Schedule" }).waitFor();
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Select Netherlands", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Target travel period" })
    .selectOption("q2-2027");
  await page
    .getByRole("button", { name: "Select Austria", exact: true })
    .click();
  await expect(page.locator(".cp-plan-title h3")).toHaveText("Austria");
  await expect(page.locator(".cp-summary")).toContainText("May 2027");
  await page.getByRole("button", { name: "Review & Schedule" }).click();
  await page
    .getByRole("button", { name: "Approve mock campaign", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Campaign approved locally",
  );
});
