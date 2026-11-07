import { expect, test, type Page } from "@playwright/test";

// Stubs Google sign-in and the Analytics APIs so the connect flow runs offline.
async function mockGoogle(page: Page, properties: { id: string; name: string; account: string }[], processed = true) {
  await page.addInitScript(() => {
    (window as any).google = {
      accounts: {
        oauth2: {
          initTokenClient: (c: any) => ({ requestAccessToken: () => setTimeout(() => c.callback({ access_token: "test-token-" + Math.random(), expires_in: 3600, scope: c.scope }), 0) }),
          hasGrantedAllScopes: () => true,
          revoke: () => {},
        },
      },
    };
  });
  const byAccount = new Map<string, typeof properties>();
  for (const p of properties) byAccount.set(p.account, [...(byAccount.get(p.account) ?? []), p]);
  await page.route("https://analyticsadmin.googleapis.com/**", (r) =>
    r.fulfill({ json: { accountSummaries: [...byAccount].map(([account, ps]) => ({ displayName: account, propertySummaries: ps.map((p) => ({ property: `properties/${p.id}`, displayName: p.name })) })) } }));
  const reports: string[] = [];
  await page.route("https://analyticsdata.googleapis.com/**", (r) => {
    const url = r.request().url();
    reports.push(url);
    const body = r.request().postDataJSON();
    if (url.endsWith(":runRealtimeReport")) {
      const dim = body.dimensions?.[0]?.name;
      if (!dim) return r.fulfill({ json: { rows: [{ metricValues: [{ value: "3" }] }] } });
      const names = dim === "country" ? ["Netherlands", "Austria"] : ["Home", "Ski pass"];
      return r.fulfill({ json: { rows: names.map((n, i) => ({ dimensionValues: [{ value: n }], metricValues: [{ value: String(2 - i) }] })) } });
    }
    return r.fulfill({ json: processed ? { rows: [{ metricValues: [{ value: "12345" }, { value: "6789" }, { value: "40000" }] }] } : {} });
  });
  return reports;
}

const PROPS = [
  { id: "111", name: "Ischgl Web", account: "TVB Paznaun-Ischgl" },
  { id: "222", name: "Personal Blog", account: "Private" },
];

test("each property is picked explicitly; several can be added and removed", async ({ page }) => {
  const reports = await mockGoogle(page, PROPS);
  let revoked = 0;
  await page.exposeFunction("__revoked", () => { revoked++; });
  await page.addInitScript(() => { (window as any).google.accounts.oauth2.revoke = () => (window as any).__revoked(); });
  await page.goto("./#data");
  const connected = page.getByRole("list", { name: "Connected properties" });

  await page.getByRole("button", { name: "Connect Google Analytics" }).click();
  await expect(page.getByText("Choose the property to add")).toBeVisible();
  expect(reports).toHaveLength(0);
  await page.getByRole("button", { name: /Ischgl Web/ }).click();
  await expect(connected.getByText("Ischgl Web")).toBeVisible();
  await expect(page.getByText("Personal Blog")).toHaveCount(0);
  const data = page.locator(".ga-data");
  await expect(data.getByText("12,345")).toBeVisible();
  expect(new Set(reports.map((u) => u.split("/properties/")[1].split(":")[0]))).toEqual(new Set(["111"]));

  // Adding again offers only the properties not connected yet.
  await page.getByRole("button", { name: "Add property" }).click();
  const picker = page.getByRole("list", { name: "Google Analytics properties" });
  await expect(picker.getByRole("button", { name: /Personal Blog/ })).toBeVisible();
  await expect(picker.getByRole("button", { name: /Ischgl Web/ })).toHaveCount(0);
  await picker.getByRole("button", { name: /Personal Blog/ }).click();
  await expect(connected.locator(":scope > li")).toHaveCount(2);

  await page.getByRole("button", { name: "Remove Ischgl Web" }).click();
  await expect(connected.locator(":scope > li")).toHaveCount(1);
  await expect(connected.getByText("Personal Blog")).toBeVisible();
  await page.getByRole("button", { name: "Remove Personal Blog" }).click();
  await expect(connected).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect Google Analytics" })).toBeVisible();
  expect(revoked).toBe(2);
});

test("a single property still has to be picked, and picking can be cancelled", async ({ page }) => {
  await mockGoogle(page, PROPS.slice(0, 1));
  await page.goto("./#data");
  await page.getByRole("button", { name: "Connect Google Analytics" }).click();
  await expect(page.getByRole("button", { name: /Ischgl Web/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "Connected properties" })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Connect Google Analytics" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Connected properties" })).toHaveCount(0);
});

test("the website data panel shows realtime users and explains missing processed data", async ({ page }) => {
  await mockGoogle(page, PROPS.slice(0, 1), false);
  await page.goto("./#data");
  await expect(page.getByText("Connect a Google Analytics property to see its live data here.")).toBeVisible();
  await page.getByRole("button", { name: "Connect Google Analytics" }).click();
  await page.getByRole("button", { name: /Ischgl Web/ }).click();
  const data = page.locator(".ga-data");
  await expect(data.locator(".ga-big")).toHaveText("3 active users");
  await expect(data.getByText("Netherlands")).toBeVisible();
  await expect(data.getByText("Ski pass")).toBeVisible();
  await expect(data.getByText(/No processed data yet/)).toBeVisible();
});
