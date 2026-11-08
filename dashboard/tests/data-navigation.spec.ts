import { expect, test } from "@playwright/test";
import { mockAnalysis } from "./helpers/analysis";
test.beforeEach(async ({ page }) => mockAnalysis(page));

test("Data combines analytics, chart controls, calendar and independent historical comparison", async ({
  page,
}) => {
  await page.goto("./#data");
  const nav = page.getByRole("navigation", { name: "Sections", exact: true });
  await expect(
    nav.getByRole("link", { name: "Data", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link")).toHaveCount(4);
  for (const name of ["Season", "Deviations", "Beds", "Market intelligence"])
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "Daily forecast guest nights, prediction range and estimated bed capacity",
    }),
  ).toBeVisible();
  await page.getByLabel("Official TR53 forecast", { exact: true }).check();
  await page.getByLabel("80% prediction band", { exact: true }).uncheck();
  await expect(
    page.getByLabel("Official TR53 forecast", { exact: true }),
  ).toBeChecked();
  await page.getByRole("slider", { name: "Inspect forecast date" }).fill("1");
  await page
    .getByRole("navigation", { name: "Data sections" })
    .getByRole("link", { name: /Beds/ })
    .click();
  await expect(page).toHaveURL(/#capacity$/);
  await page
    .getByRole("button", {
      name: "1 Jan 2027: 50% estimated utilisation",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "1 Jan 2027: 50% estimated utilisation",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByLabel("Historical comparison season")
    .selectOption("summer 26");
  await expect(
    page.getByRole("heading", { name: "Drivers behind the gap" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});
for (const hash of ["season", "why", "capacity", "markets"])
  test(`legacy #${hash} opens its section inside Data`, async ({ page }) => {
    await page.goto(`./#${hash}`);
    await expect(
      page.getByRole("heading", { name: "Data", exact: true }),
    ).toBeVisible();
    await expect(page.locator(`#${hash}`)).toBeVisible();
  });

test("country selection changes audience analysis; dates recalculate both market and destination data", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/c04-api/")) requests.push(r.url());
  });
  await page.goto("./#data");
  await expect(
    page.getByRole("heading", { name: "Germany in focus" }),
  ).toBeVisible();
  await page.getByLabel("Origin market", { exact: true }).selectOption("NL");
  await expect(
    page.getByRole("heading", { name: "Netherlands in focus" }),
  ).toBeVisible();
  await expect(page.getByText("41,208", { exact: true })).toHaveCount(2);
  await page.getByLabel("Analysis start date").fill("2027-02-01");
  await page.getByLabel("Analysis end date").fill("2027-02-07");
  await page.getByRole("button", { name: /Apply dates/ }).click();
  await expect(page.getByText("7 of 7 selected days covered")).toBeVisible();
  expect(
    requests.some((url) =>
      url.includes("forecast?start=2027-02-01&end=2027-02-07"),
    ),
  ).toBeTruthy();
  expect(
    requests.some((url) =>
      url.includes("origin=25&start=2027-02-01&end=2027-02-07"),
    ),
  ).toBeTruthy();
  await page.getByLabel("Analysis period preset").selectOption("Summer 2027");
  await expect(
    page.getByText("No daily forecast in this period.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("0 of 153 selected days covered")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Netherlands in focus" }),
  ).toBeVisible();
  await expect(
    page.locator(".di-focus-metrics").getByText("41,208", { exact: true }),
  ).toBeVisible();
});

test("failed resources show retry without mock metrics; missing capacity is unknown", async ({
  page,
}) => {
  let failed = true;
  await page.route("**/c04-api/forecast?**", (route) =>
    failed
      ? route.fulfill({ status: 503, json: { error: "unavailable" } })
      : route.fulfill({
          json: {
            meta: {},
            daily: [
              { date: "2027-01-01", forecast_ours: 200, capacity_est: null },
            ],
          },
        }),
  );
  await page.goto("./#data");
  await expect(page.locator("#season").getByRole("alert")).toContainText(
    "unavailable",
  );
  await expect(
    page.getByText("Forecast guest nights", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Germany in focus" }),
  ).toBeVisible();
  failed = false;
  await page
    .locator("#season")
    .getByRole("button", { name: "Retry data" })
    .click();
  await expect(page.getByText("1 of 181 selected days covered")).toBeVisible();
  await expect(
    page
      .locator("#season .di-metric")
      .filter({ hasText: "Estimated utilisation" })
      .locator("strong"),
  ).toHaveText("—");
  await expect(
    page
      .locator("#season .di-metric")
      .filter({ hasText: "Potential spare bed-nights" })
      .locator("strong"),
  ).toHaveText("—");
});

test("changing dates cancels old results; reversed dates retain the last valid analysis", async ({
  page,
}) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/c04-api/forecast?**", async (route) => {
    const q = new URL(route.request().url()).searchParams;
    if (q.get("start") === "2026-11-01") await gate;
    await route
      .fulfill({
        json: {
          meta: {},
          daily: [
            {
              date: q.get("start"),
              forecast_ours: q.get("start") === "2026-11-01" ? 999999 : 123,
              capacity_est: 1000,
            },
          ],
        },
      })
      .catch(() => {});
  });
  await page.goto("./#data");
  await page
    .getByLabel("Analysis period preset")
    .selectOption("January–March 2027");
  await expect(
    page
      .locator("#season .di-metric")
      .filter({ hasText: "Forecast guest nights" })
      .locator("strong"),
  ).toHaveText("123");
  release();
  await expect(
    page
      .locator("#season .di-metric")
      .filter({ hasText: "Forecast guest nights" })
      .locator("strong"),
  ).toHaveText("123");
  await page.getByLabel("Analysis start date").fill("2027-03-10");
  await page.getByLabel("Analysis end date").fill("2027-03-01");
  await page.getByRole("button", { name: /Apply dates/ }).click();
  await expect(page.getByRole("alert")).toContainText("valid period");
  await expect(
    page
      .locator("#season .di-metric")
      .filter({ hasText: "Forecast guest nights" })
      .locator("strong"),
  ).toHaveText("123");
});
