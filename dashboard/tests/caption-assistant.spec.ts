import { test, expect } from "@playwright/test";
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
const answer = (caption: string, language = "de") => ({
  caption,
  hashtags: ["#Ischgl", "#Alpen"],
  language,
  source: "ai",
});
test("real-service response replaces demo, regeneration is explicit, copy works, and changed text requires fresh approval", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  let calls = 0;
  await page.route("**/api/marketing/generate-caption", async (route) => {
    calls++;
    const metadata = route.request().postDataJSON();
    expect(metadata.country).toBe("Germany");
    expect(metadata.language).toBe("de");
    expect(metadata.ageMin).toBe(18);
    expect(metadata.visualDescription).toContain("cat");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        answer(calls === 1 ? "Erste Alpenidee. 🐈" : "Neue Alpenidee. ⛷️"),
      ),
    });
  });
  await page.goto("./");
  await expect(page.locator(".cp-caption-source.ai").first()).toHaveText(
    "AI caption",
  );
  await expect(page.locator(".cp-caption-text")).toHaveText(
    "Erste Alpenidee. 🐈",
  );
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "Copy caption" }).click();
  await expect(page.getByText("Copied", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Erste Alpenidee. 🐈\n\n#Ischgl #Alpen",
  );
  await page.getByRole("button", { name: "Review & Schedule" }).click();
  await expect(page.getByRole("dialog")).toContainText("Erste Alpenidee. 🐈");
  await page
    .getByRole("button", { name: "Approve mock campaign", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".cp-plan-action")).toContainText(
    "Approved locally",
  );
  await page.getByRole("button", { name: "Regenerate", exact: true }).click();
  await expect(page.locator(".cp-caption-text")).toHaveText(
    "Neue Alpenidee. ⛷️",
  );
  expect(calls).toBe(2);
  await expect(page.locator(".cp-plan-action")).not.toContainText(
    "Approved locally",
  );
});
test("country switching ignores a delayed response and successful captions are cached by metadata", async ({
  page,
}) => {
  let deCalls = 0,
    nlCalls = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  let started: () => void = () => {};
  const pending = new Promise<void>((resolve) => (started = resolve));
  await page.route("**/api/marketing/generate-caption", async (route) => {
    const metadata = route.request().postDataJSON();
    if (metadata.country === "Germany") {
      deCalls++;
      started();
      await gate;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(answer("Deutsche Winteridee.")),
      });
    } else {
      nlCalls++;
      expect(metadata.language).toBe("nl");
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(answer("Even naar de Alpen.", "nl")),
      });
    }
  });
  await page.goto("./");
  await pending;
  await expect(page.getByText("Generating…", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Select Netherlands", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Select Netherlands", exact: true })
    .click();
  await expect(page.locator(".cp-caption-text")).toHaveText(
    "Even naar de Alpen.",
  );
  release();
  await expect(page.locator(".cp-caption-text")).toHaveText(
    "Even naar de Alpen.",
  );
  await page
    .getByRole("button", { name: "Select Germany", exact: true })
    .click();
  await expect(page.locator(".cp-caption-text")).toHaveText(
    "Deutsche Winteridee.",
  );
  await page
    .getByRole("button", { name: "Select Netherlands", exact: true })
    .click();
  await expect(page.locator(".cp-caption-text")).toHaveText(
    "Even naar de Alpen.",
  );
  expect(deCalls).toBe(1);
  expect(nlCalls).toBe(1);
});
test("missing key and failed generation visibly retain the demo with a retry action", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/marketing/generate-caption", (route) => {
    calls++;
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "NOT_CONFIGURED",
          message:
            "AI captions are not configured yet. The demo caption is still available.",
        },
      }),
    });
  });
  await page.goto("./");
  await expect(page.locator(".cp-caption-source.demo")).toHaveText(
    "Demo caption",
  );
  await expect(page.locator(".cp-caption-error")).toContainText(
    "not configured",
  );
  await expect(page.locator(".cp-caption-text")).toContainText(
    "Klausuren vorbei",
  );
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => calls).toBe(2);
  await expect(page.locator(".cp-caption-source.ai")).toHaveCount(0);
});
test("failed forced regeneration does not replace a successful cached caption", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/marketing/generate-caption", (route) => {
    calls++;
    return route.fulfill(
      calls === 1
        ? {
            contentType: "application/json",
            body: JSON.stringify(answer("Eine gute Alpenidee.")),
          }
        : {
            status: 504,
            contentType: "application/json",
            body: JSON.stringify({
              error: {
                code: "PROVIDER_TIMEOUT",
                message: "AI generation timed out.",
              },
            }),
          },
    );
  });
  await page.goto("./");
  await expect(page.locator(".cp-caption-text")).toHaveText(
    "Eine gute Alpenidee.",
  );
  await page.getByRole("button", { name: "Regenerate", exact: true }).click();
  await expect(page.locator(".cp-caption-error")).toContainText(
    "previous AI caption is unchanged",
  );
  await expect(page.locator(".cp-caption-text")).toHaveText(
    "Eine gute Alpenidee.",
  );
  await expect(page.locator(".cp-caption-source.ai")).toHaveCount(1);
});
test("spring selection sends updated metadata and no API credential is present in browser requests", async ({
  page,
}) => {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/marketing/generate-caption", (route) => {
    const m = route.request().postDataJSON();
    requests.push(m);
    expect(Object.keys(m).some((key) => /key|token|secret/i.test(key))).toBe(
      false,
    );
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        answer(
          m.season === "spring"
            ? "Frühlingsluft in den Alpen."
            : "Winteridee für die Alpen.",
          m.language,
        ),
      ),
    });
  });
  await page.goto("./");
  await expect(page.locator(".cp-caption-text")).toHaveText(
    "Winteridee für die Alpen.",
  );
  await page
    .getByRole("combobox", { name: "Target travel period" })
    .selectOption("q2-2027");
  await expect(page.locator(".cp-caption-text")).toHaveText(
    "Frühlingsluft in den Alpen.",
  );
  expect(requests).toHaveLength(2);
  expect(requests[1].season).toBe("spring");
  expect(requests[1].activity).toBe("Alpine mountain getaway");
});
